const pool = require('../../config/database');
const logger = require('../../utils/logger');
const axios = require('axios');
const { translateText } = require('../../config/translation');

// Schedule next drip step for subscriber
exports.scheduleNextDripStep = async (subscriber_id) => {
  try {
    const subscriberResult = await pool.query(`
      SELECT 
        dcs.*,
        dc.campaign_name,
        l.id as lead_id,
        l.phone_number,
        l.email,
        l.preferred_language,
        l.company_id
      FROM drip_campaign_subscribers dcs
      JOIN drip_campaigns dc ON dcs.campaign_id = dc.id
      JOIN leads l ON dcs.lead_id = l.id
      WHERE dcs.id = $1 AND dcs.status = 'active'
    `, [subscriber_id]);
    
    if (subscriberResult.rows.length === 0) {
      return;
    }
    
    const subscriber = subscriberResult.rows[0];
    const next_step_number = subscriber.current_step + 1;
    
    const stepResult = await pool.query(`
      SELECT * FROM drip_campaign_steps
      WHERE campaign_id = $1 AND step_number = $2 AND is_active = TRUE
    `, [subscriber.campaign_id, next_step_number]);
    
    if (stepResult.rows.length === 0) {
      await pool.query(`
        UPDATE drip_campaign_subscribers
        SET status = 'completed', completed_at = NOW(), current_step = $1
        WHERE id = $2
      `, [next_step_number - 1, subscriber_id]);
      
      await pool.query(`
        UPDATE drip_campaigns
        SET total_completed = total_completed + 1
        WHERE id = $1
      `, [subscriber.campaign_id]);
      
      return;
    }
    
    const step = stepResult.rows[0];
    
    const delay_minutes = 
      (step.delay_days * 24 * 60) + 
      (step.delay_hours * 60) + 
      step.delay_minutes;
    
    const scheduled_for = new Date(Date.now() + delay_minutes * 60 * 1000);
    
    await pool.query(`
      INSERT INTO drip_step_executions (
        subscriber_id, step_id, lead_id,
        status, scheduled_for
      )
      VALUES ($1, $2, $3, 'pending', $4)
    `, [subscriber_id, step.id, subscriber.lead_id, scheduled_for]);
    
    await pool.query(`
      UPDATE drip_campaign_subscribers
      SET current_step = $1
      WHERE id = $2
    `, [next_step_number, subscriber_id]);
    
    logger.info(`✅ Scheduled step ${next_step_number} for subscriber ${subscriber_id}`);
    
  } catch (error) {
    logger.error('Schedule next step error:', error);
    throw error;
  }
};

// Execute pending drip steps
exports.executePendingDripSteps = async () => {
  try {
    const pendingResult = await pool.query(`
      SELECT 
        dse.*,
        dcs.step_type,
        dcs.subject,
        dcs.message_body,
        dcs.template_id,
        dcsu.campaign_id,
        l.phone_number,
        l.email,
        l.name as lead_name,
        l.preferred_language,
        l.company_id
      FROM drip_step_executions dse
      JOIN drip_campaign_steps dcs ON dse.step_id = dcs.id
      JOIN drip_campaign_subscribers dcsu ON dse.subscriber_id = dcsu.id
      JOIN leads l ON dse.lead_id = l.id
      WHERE dse.status = 'pending'
      AND dse.scheduled_for <= NOW()
      AND dcsu.status = 'active'
      LIMIT 100
    `);
    
    for (const execution of pendingResult.rows) {
      try {
        let sent = false;
        
        switch (execution.step_type) {
          case 'email':
            if (execution.email) {
              sent = await sendDripEmail(execution);
            }
            break;
            
          case 'whatsapp':
            if (execution.phone_number) {
              sent = await sendDripWhatsApp(execution);
            }
            break;
            
          case 'wait':
            sent = true;
            break;
            
          case 'task':
            sent = await createDripTask(execution);
            break;
        }
        
        if (sent) {
          await pool.query(`
            UPDATE drip_step_executions
            SET status = 'sent', sent_at = NOW()
            WHERE id = $1
          `, [execution.id]);
          
          await pool.query(`
            UPDATE drip_campaign_subscribers
            SET last_step_sent_at = NOW()
            WHERE id = $1
          `, [execution.subscriber_id]);
          
          await exports.scheduleNextDripStep(execution.subscriber_id);
          
          await updateCampaignPerformance(execution.campaign_id, 'messages_sent');
        }
        
      } catch (error) {
        logger.error(`Execution ${execution.id} failed:`, error);
        
        await pool.query(`
          UPDATE drip_step_executions
          SET status = 'failed', error_message = $1
          WHERE id = $2
        `, [error.message, execution.id]);
      }
    }
    
    if (pendingResult.rows.length > 0) {
      logger.info(`✅ Executed ${pendingResult.rows.length} drip steps`);
    }
    
  } catch (error) {
    logger.error('Execute pending drip steps error:', error);
  }
};

// Helper: Get company email config
async function getCompanyEmailConfig(company_id) {
  const result = await pool.query(
    'SELECT email_address, email_password, smtp_host, smtp_port FROM companies WHERE id = $1',
    [company_id]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Company email configuration not found');
  }
  
  return result.rows[0];
}

// Helper: Create email transporter
async function createEmailTransporter(emailConfig) {
  const nodemailer = require('nodemailer');
  
  return nodemailer.createTransport({
    host: emailConfig.smtp_host || 'smtp.gmail.com',
    port: emailConfig.smtp_port || 587,
    secure: false,
    auth: {
      user: emailConfig.email_address,
      pass: emailConfig.email_password
    }
  });
}

// Send drip email
async function sendDripEmail(execution) {
  try {
    const emailConfig = await getCompanyEmailConfig(execution.company_id);
    const transporter = await createEmailTransporter(emailConfig);
    
    let message = execution.message_body;
    if (execution.preferred_language !== 'en') {
      message = await translateText(message, execution.preferred_language, 'en');
    }
    
    const mailOptions = {
      from: emailConfig.email_address,
      to: execution.email,
      subject: execution.subject,
      html: message
    };
    
    await transporter.sendMail(mailOptions);
    
    await pool.query(`
      INSERT INTO email_queue (
        to_email, subject, body, lead_id, status, sent_at
      )
      VALUES ($1, $2, $3, $4, 'sent', NOW())
    `, [execution.email, execution.subject, 'Drip email sent', execution.lead_id]);
    
    return true;
  } catch (error) {
    logger.error('Send drip email error:', error);
    return false;
  }
}

// Send drip WhatsApp
async function sendDripWhatsApp(execution) {
  try {
    const agentResult = await pool.query(`
      SELECT ai.* FROM agent_instances ai
      WHERE ai.company_id = $1 
      AND ai.agent_type = 'whatsapp'
      AND ai.is_active = TRUE
      LIMIT 1
    `, [execution.company_id]);
    
    if (agentResult.rows.length === 0) {
      throw new Error('No WhatsApp agent configured');
    }
    
    const agent = agentResult.rows[0];
    const credentials = agent.whatsapp_credentials;
    
    let message = execution.message_body;
    if (execution.preferred_language !== 'en') {
      message = await translateText(message, execution.preferred_language, 'en');
    }
    
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
      {
        messaging_product: 'whatsapp',
        to: execution.phone_number.replace('+', ''),
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    await pool.query(`
      INSERT INTO whatsapp_messages 
      (lead_id, phone_number, message_type, message_body, sender, is_from_user, message_id)
      VALUES ($1, $2, 'text', $3, 'bot', FALSE, $4)
    `, [execution.lead_id, execution.phone_number, message, response.data.messages[0].id]);
    
    return true;
  } catch (error) {
    logger.error('Send drip WhatsApp error:', error);
    return false;
  }
}

// Create drip task
async function createDripTask(execution) {
  try {
    await pool.query(`
      INSERT INTO tasks (
        company_id, lead_id, task_type, title,
        description, due_date, priority, status
      )
      VALUES ($1, $2, 'follow_up', $3, $4, $5, 'medium', 'pending')
    `, [
      execution.company_id,
      execution.lead_id,
      `Drip Campaign Task: ${execution.subject || 'Follow up'}`,
      execution.message_body,
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    ]);
    
    return true;
  } catch (error) {
    logger.error('Create drip task error:', error);
    return false;
  }
}

// Update campaign performance
async function updateCampaignPerformance(campaign_id, metric, increment = 1) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    await pool.query(`
      INSERT INTO campaign_performance (campaign_id, date, ${metric})
      VALUES ($1, $2, $3)
      ON CONFLICT (campaign_id, date) DO UPDATE
      SET ${metric} = campaign_performance.${metric} + $3
    `, [campaign_id, today, increment]);
    
  } catch (error) {
    logger.error('Update campaign performance error:', error);
  }
}

/**
 * Execute drip step (send message)
 */
exports.executeDripStep = async (execution_id) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get execution details
    const executionResult = await client.query(`
      SELECT 
        dce.*,
        dcs.step_number,
        dcs.step_name,
        dcs.channel,
        dcs.subject,
        dcs.message_body,
        dcsu.lead_id,
        dcsu.current_step,
        dcsu.campaign_id,
        l.phone_number,
        l.email,
        l.name as lead_name,
        dc.company_id
      FROM drip_campaign_executions dce
      JOIN drip_campaign_steps dcs ON dce.step_id = dcs.id
      JOIN drip_campaign_subscribers dcsu ON dce.subscriber_id = dcsu.id
      JOIN leads l ON dcsu.lead_id = l.id
      JOIN drip_campaigns dc ON dcsu.campaign_id = dc.id
      WHERE dce.id = $1
    `, [execution_id]);

    if (executionResult.rows.length === 0) {
      throw new Error('Execution not found');
    }

    const execution = executionResult.rows[0];

    // Check if already executed
    if (execution.status !== 'pending') {
      logger.info(`Execution ${execution_id} already ${execution.status}`);
      await client.query('COMMIT');
      return;
    }

    // Check if subscriber still active
    const subscriberCheck = await client.query(
      'SELECT status FROM drip_campaign_subscribers WHERE id = $1',
      [execution.subscriber_id]
    );

    if (subscriberCheck.rows[0].status !== 'active') {
      await client.query(`
        UPDATE drip_campaign_executions
        SET status = 'skipped', error_message = 'Subscriber not active'
        WHERE id = $1
      `, [execution_id]);

      await client.query('COMMIT');
      return;
    }

    // Personalize message
    let personalizedMessage = execution.message_body
      .replace(/\{\{name\}\}/g, execution.lead_name || '')
      .replace(/\{\{phone\}\}/g, execution.phone_number || '')
      .replace(/\{\{email\}\}/g, execution.email || '');

    // Send message based on channel
    let deliveryStatus = 'failed';
    let errorMessage = null;

    try {
      if (execution.channel === 'whatsapp') {
        // Send via WhatsApp API
        await axios.post(`${process.env.BASE_URL}/api/whatsapp/send`, {
          to: execution.phone_number,
          message: personalizedMessage,
          company_id: execution.company_id
        });
        deliveryStatus = 'sent';
      } else if (execution.channel === 'sms') {
        // Send via SMS API
        await axios.post(`${process.env.BASE_URL}/api/sms/send`, {
          company_id: execution.company_id,
          lead_id: execution.lead_id,
          to_number: execution.phone_number,
          message_body: personalizedMessage
        });
        deliveryStatus = 'sent';
      } else if (execution.channel === 'email') {
        // Send via Email API (implement email sending)
        // await sendEmail(...)
        deliveryStatus = 'sent';
      }
    } catch (sendError) {
      logger.error(`Drip execution ${execution_id} send error:`, sendError.message);
      errorMessage = sendError.message;
    }

    // Update execution
    await client.query(`
      UPDATE drip_campaign_executions
      SET 
        status = $1,
        delivery_status = $2,
        executed_at = NOW(),
        error_message = $3
      WHERE id = $4
    `, [deliveryStatus === 'sent' ? 'sent' : 'failed', deliveryStatus, errorMessage, execution_id]);

    // Update subscriber current step if successful
    if (deliveryStatus === 'sent') {
      await client.query(`
        UPDATE drip_campaign_subscribers
        SET 
          current_step = $1,
          last_interaction_at = NOW(),
          total_messages_sent = total_messages_sent + 1
        WHERE id = $2
      `, [execution.step_number, execution.subscriber_id]);

      // Schedule next step
      await exports.scheduleNextDripStep(execution.subscriber_id);
    }

    logger.info(`Drip execution ${execution_id} completed with status: ${deliveryStatus}`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Execute drip step error:', error);

    // Mark as failed
    try {
      await pool.query(`
        UPDATE drip_campaign_executions
        SET 
          status = 'failed',
          error_message = $1
        WHERE id = $2
      `, [error.message, execution_id]);
    } catch (updateError) {
      logger.error('Failed to update execution status:', updateError);
    }

    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check drip conditions (e.g., opened, clicked, replied)
 */
exports.checkDripConditions = async (subscriber_id, conditions) => {
  try {
    if (!conditions || Object.keys(conditions).length === 0) {
      return true; // No conditions = always pass
    }

    const subscriberResult = await pool.query(`
      SELECT * FROM drip_campaign_subscribers
      WHERE id = $1
    `, [subscriber_id]);

    if (subscriberResult.rows.length === 0) {
      return false;
    }

    const subscriber = subscriberResult.rows[0];

    // Check opened condition
    if (conditions.requires_open) {
      if (subscriber.total_messages_opened === 0) {
        return false;
      }
    }

    // Check clicked condition
    if (conditions.requires_click) {
      if (subscriber.total_messages_clicked === 0) {
        return false;
      }
    }

    // Check minimum engagement
    if (conditions.min_engagement_score) {
      const engagementScore = 
        (subscriber.total_messages_opened * 2) + 
        (subscriber.total_messages_clicked * 3);
      
      if (engagementScore < conditions.min_engagement_score) {
        return false;
      }
    }

    // Check time-based conditions
    if (conditions.days_since_enrollment) {
      const daysSince = Math.floor(
        (Date.now() - new Date(subscriber.enrolled_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSince < conditions.days_since_enrollment) {
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('Check drip conditions error:', error);
    return false;
  }
};

/**
 * Process pending drip executions (called by scheduler)
 */
exports.processPendingExecutions = async () => {
  try {
    // Get all pending executions that are due
    const result = await pool.query(`
      SELECT id FROM drip_campaign_executions
      WHERE status = 'pending' AND scheduled_for <= NOW()
      ORDER BY scheduled_for ASC
      LIMIT 100
    `);

    logger.info(`Processing ${result.rows.length} pending drip executions`);

    for (const row of result.rows) {
      try {
        await exports.executeDripStep(row.id);
      } catch (error) {
        logger.error(`Failed to execute drip step ${row.id}:`, error.message);
      }
    }

    return {
      processed: result.rows.length
    };
  } catch (error) {
    logger.error('Process pending executions error:', error);
    throw error;
  }
};

/**
 * Update campaign analytics
 */
exports.updateCampaignAnalytics = async (campaign_id) => {
  try {
    const date = new Date().toISOString().split('T')[0];

    const result = await pool.query(`
      INSERT INTO drip_campaign_analytics (
        campaign_id, date,
        enrolled_count, active_count, completed_count, unsubscribed_count,
        messages_sent, messages_delivered, messages_opened, messages_clicked
      )
      SELECT 
        $1, $2,
        COUNT(*) FILTER (WHERE enrolled_at::date = $2),
        COUNT(*) FILTER (WHERE status = 'active'),
        COUNT(*) FILTER (WHERE status = 'completed'),
        COUNT(*) FILTER (WHERE status = 'unsubscribed'),
        SUM(total_messages_sent),
        SUM(total_messages_sent),
        SUM(total_messages_opened),
        SUM(total_messages_clicked)
      FROM drip_campaign_subscribers
      WHERE campaign_id = $1
      ON CONFLICT (campaign_id, date) DO UPDATE
      SET
        enrolled_count = EXCLUDED.enrolled_count,
        active_count = EXCLUDED.active_count,
        completed_count = EXCLUDED.completed_count,
        unsubscribed_count = EXCLUDED.unsubscribed_count,
        messages_sent = EXCLUDED.messages_sent,
        messages_delivered = EXCLUDED.messages_delivered,
        messages_opened = EXCLUDED.messages_opened,
        messages_clicked = EXCLUDED.messages_clicked
      RETURNING *
    `, [campaign_id, date]);

    return result.rows[0];
  } catch (error) {
    logger.error('Update campaign analytics error:', error);
    throw error;
  }
};


module.exports = exports;