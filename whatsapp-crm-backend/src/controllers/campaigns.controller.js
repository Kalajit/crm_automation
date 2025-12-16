const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');
const { RATE_LIMITS } = require('../config/constants');
const redis = require('../config/redis');
const axios = require('axios');

/**
 * Create campaign with bulk scheduled calls
 */
exports.createCampaign = async (req, res) => {
  try {
    const { company_id, campaign_name, campaign_type, target_leads, scheduled_start, call_rate_per_minute } = req.body;

    if (!company_id || !campaign_name || !target_leads) {
      return res.status(400).json({ error: 'company_id, campaign_name, and target_leads are required' });
    }

    // Create campaign
    const query = `
      INSERT INTO campaigns (
        company_id, campaign_name, campaign_type, 
        total_leads, scheduled_start, call_rate_per_minute, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
      RETURNING *;
    `;

    const result = await pool.query(query, [
      company_id,
      campaign_name,
      campaign_type || 'outbound',
      target_leads.length,
      scheduled_start || new Date().toISOString(),
      call_rate_per_minute || 1
    ]);

    const campaign_id = result.rows[0].id;

    // Bulk insert scheduled calls
    const values = target_leads.map((lead, idx) => 
      `(${company_id}, ${lead.lead_id}, '${campaign_type}', '${scheduled_start}', ${campaign_id})`
    ).join(',');

    await pool.query(`
      INSERT INTO scheduled_calls (company_id, lead_id, call_type, scheduled_time, campaign_id)
      VALUES ${values}
    `);

    logRequest('POST', '/api/campaigns', 201);
    res.status(201).json({ 
      success: true, 
      campaign_id: campaign_id,
      scheduled_calls: target_leads.length,
      message: `Campaign created with ${target_leads.length} calls scheduled`
    });
  } catch (error) {
    logRequest('POST', '/api/campaigns', 500);
    handleError(res, error);
  }
};

/**
 * Get campaign statistics
 */
exports.getCampaignStats = async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await pool.query(`
      SELECT 
        c.campaign_name, c.total_leads, c.status as campaign_status,
        COUNT(sc.id) FILTER (WHERE sc.status = 'pending') as pending,
        COUNT(sc.id) FILTER (WHERE sc.status = 'called') as called,
        COUNT(cl.id) FILTER (WHERE cl.call_status = 'completed') as completed,
        COUNT(cl.id) FILTER (WHERE cl.call_status = 'failed') as failed,
        AVG(cl.call_duration) as avg_duration
      FROM campaigns c
      LEFT JOIN scheduled_calls sc ON c.id = sc.campaign_id
      LEFT JOIN call_logs cl ON sc.call_sid = cl.call_sid
      WHERE c.id = $1
      GROUP BY c.id
    `, [id]);

    if (stats.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    logRequest('GET', `/api/campaigns/${id}/stats`, 200);
    sendSuccess(res, { data: stats.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/campaigns/${id}/stats`, 500);
    handleError(res, error);
  }
};



exports.getCampaigns = async (req, res) => {
  try {
    const { company_id } = req.query;
    
    let query = 'SELECT * FROM campaigns WHERE 1=1';
    const params = [];
    
    if (company_id) {
      params.push(parseInt(company_id));
      query += ` AND company_id = $${params.length}`;
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    handleError(res, error);
  }
};

exports.sendBulkWhatsApp = async (req, res) => {
  try {
    const { recipients, message, agent_instance_id, schedule_time } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Recipients array required' });
    }

    if (!message || !agent_instance_id) {
      return res.status(400).json({ error: 'Message and agent_instance_id required' });
    }

    const agentResult = await pool.query(
      `SELECT ai.*, c.id as company_id 
       FROM agent_instances ai
       JOIN companies c ON ai.company_id = c.id
       WHERE ai.id = $1`,
      [agent_instance_id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent instance not found' });
    }

    const agent = agentResult.rows[0];

    if (schedule_time) {
      const scheduledTime = new Date(schedule_time);
      if (scheduledTime <= new Date()) {
        return res.status(400).json({ error: 'Schedule time must be in the future' });
      }

      const bulkJobResult = await pool.query(
        `INSERT INTO bulk_message_jobs 
         (company_id, agent_instance_id, message, recipients, total_count, status, scheduled_time)
         VALUES ($1, $2, $3, $4, $5, 'scheduled', $6)
         RETURNING id`,
        [agent.company_id, agent_instance_id, message, JSON.stringify(recipients), recipients.length, scheduledTime]
      );

      return res.json({
        success: true,
        job_id: bulkJobResult.rows[0].id,
        scheduled_for: scheduledTime,
        total_recipients: recipients.length
      });
    }

    const jobResult = await pool.query(
      `INSERT INTO bulk_message_jobs 
       (company_id, agent_instance_id, message, recipients, total_count, status)
       VALUES ($1, $2, $3, $4, $5, 'processing')
       RETURNING id`,
      [agent.company_id, agent_instance_id, message, JSON.stringify(recipients), recipients.length]
    );

    const jobId = jobResult.rows[0].id;

    processBulkMessages(jobId, recipients, message, agent).catch(err => {
      console.error('Bulk message processing error:', err);
    });

    res.json({
      success: true,
      job_id: jobId,
      total_recipients: recipients.length,
      status: 'processing'
    });

  } catch (error) {
    console.error('Bulk send error:', error);
    res.status(500).json({ error: error.message });
  }
};

async function processBulkMessages(jobId, recipients, message, agent) {
  const batchSize = RATE_LIMITS.bulk.batch_size;
  const delayBetweenBatches = RATE_LIMITS.bulk.delay_between_batches_ms;
  
  let successCount = 0;
  let failedCount = 0;
  const failedRecipients = [];

  try {
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      const rateLimitCheck = await checkRateLimit(agent.company_id);
      if (!rateLimitCheck.allowed) {
        const waitTime = rateLimitCheck.retry_after * 1000;
        console.log(`Rate limit hit, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const batchPromises = batch.map(async (recipient) => {
        try {
          await sendSingleWhatsAppMessage(agent, recipient, message);
          successCount++;
          
          await pool.query(
            `UPDATE bulk_message_jobs 
             SET sent_count = $1, updated_at = NOW()
             WHERE id = $2`,
            [successCount, jobId]
          );
        } catch (error) {
          failedCount++;
          failedRecipients.push({ phone: recipient, error: error.message });
          
          await pool.query(
            `UPDATE bulk_message_jobs 
             SET failed_count = $1, updated_at = NOW()
             WHERE id = $2`,
            [failedCount, jobId]
          );
        }
      });

      await Promise.all(batchPromises);

      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    await pool.query(
      `UPDATE bulk_message_jobs 
       SET status = 'completed',
           sent_count = $1,
           failed_count = $2,
           failed_recipients = $3,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [successCount, failedCount, JSON.stringify(failedRecipients), jobId]
    );

    console.log(`Bulk job ${jobId} completed: ${successCount} sent, ${failedCount} failed`);

  } catch (error) {
    console.error(`Bulk job ${jobId} error:`, error);
    
    await pool.query(
      `UPDATE bulk_message_jobs 
       SET status = 'failed',
           error_message = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [error.message, jobId]
    );
  }
}

async function sendSingleWhatsAppMessage(agent, recipient, message) {
  const credentials = agent.whatsapp_credentials;
  
  const response = await axios.post(
    `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { 
        preview_url: true,
        body: message 
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );

  return response.data;
}

async function checkRateLimit(companyId) {
  // Implement rate limiting logic
  return { allowed: true };
}

exports.getBulkJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;

    const result = await pool.query(
      `SELECT * FROM bulk_message_jobs WHERE id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = result.rows[0];
    
    res.json({
      job_id: job.id,
      status: job.status,
      total_recipients: job.total_count,
      sent: job.sent_count,
      failed: job.failed_count,
      failed_recipients: job.failed_recipients,
      scheduled_time: job.scheduled_time,
      created_at: job.created_at,
      completed_at: job.completed_at
    });

  } catch (error) {
    console.error('Job status error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getRateLimitStats = async (req, res) => {
  try {
    const { companyId } = req.params;
    const now = Date.now();

    const companyKey = `ratelimit:company:${companyId}`;
    
    const minuteKey = `${companyKey}:minute:${Math.floor(now / 60000)}`;
    const hourKey = `${companyKey}:hour:${Math.floor(now / 3600000)}`;
    const dayKey = `${companyKey}:day:${Math.floor(now / 86400000)}`;

    const [minuteCount, hourCount, dayCount] = await Promise.all([
      redis.get(minuteKey),
      redis.get(hourKey),
      redis.get(dayKey)
    ]);

    res.json({
      company_id: companyId,
      current_usage: {
        minute: parseInt(minuteCount) || 0,
        hour: parseInt(hourCount) || 0,
        day: parseInt(dayCount) || 0
      },
      limits: {
        minute: RATE_LIMITS.company.messages_per_minute,
        hour: RATE_LIMITS.company.messages_per_hour,
        day: RATE_LIMITS.company.messages_per_day
      },
      remaining: {
        minute: RATE_LIMITS.company.messages_per_minute - (parseInt(minuteCount) || 0),
        hour: RATE_LIMITS.company.messages_per_hour - (parseInt(hourCount) || 0),
        day: RATE_LIMITS.company.messages_per_day - (parseInt(dayCount) || 0)
      }
    });

  } catch (error) {
    console.error('Rate limit stats error:', error);
    res.status(500).json({ error: error.message });
  }
};