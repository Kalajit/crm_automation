const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');
const dripCampaignService = require('../services/dripCampaign/dripCampaign.service');

// Create drip campaign
exports.createDripCampaign = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      company_id,
      campaign_name,
      description,
      trigger_type,
      trigger_conditions,
      steps
    } = req.body;
    
    if (!company_id || !campaign_name || !trigger_type) {
      return errorResponse(res, 'company_id, campaign_name, and trigger_type are required', 400);
    }
    
    const campaignResult = await client.query(`
      INSERT INTO drip_campaigns (
        company_id, campaign_name, description,
        trigger_type, trigger_conditions, is_active
      )
      VALUES ($1, $2, $3, $4, $5, FALSE)
      RETURNING *
    `, [
      company_id,
      campaign_name,
      description || null,
      trigger_type,
      JSON.stringify(trigger_conditions || {})
    ]);
    
    const campaign_id = campaignResult.rows[0].id;
    
    if (steps && Array.isArray(steps)) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await client.query(`
          INSERT INTO drip_campaign_steps (
            campaign_id, step_number, step_type,
            delay_days, delay_hours, delay_minutes,
            subject, message_body, template_id,
            send_conditions, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
        `, [
          campaign_id,
          i + 1,
          step.step_type,
          step.delay_days || 0,
          step.delay_hours || 0,
          step.delay_minutes || 0,
          step.subject || null,
          step.message_body || null,
          step.template_id || null,
          JSON.stringify(step.send_conditions || {})
        ]);
      }
    }
    
    await client.query('COMMIT');
    
    logger.info('POST', '/api/drip-campaigns', 201);
    return successResponse(res, campaignResult.rows[0], 'Drip campaign created successfully', 201);
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Create drip campaign error:', error);
    return errorResponse(res, error.message, 500);
  } finally {
    client.release();
  }
};

// Get all drip campaigns
exports.getDripCampaigns = async (req, res) => {
  try {
    const { company_id } = req.params;
    const { is_active } = req.query;
    
    let query = `
      SELECT 
        dc.*,
        COUNT(DISTINCT dcs.id) as total_steps,
        COUNT(DISTINCT dcsu.id) FILTER (WHERE dcsu.status = 'active') as active_subscribers,
        COUNT(DISTINCT dcsu.id) FILTER (WHERE dcsu.status = 'completed') as completed_subscribers
      FROM drip_campaigns dc
      LEFT JOIN drip_campaign_steps dcs ON dc.id = dcs.campaign_id
      LEFT JOIN drip_campaign_subscribers dcsu ON dc.id = dcsu.campaign_id
      WHERE dc.company_id = $1
    `;
    
    const params = [company_id];
    
    if (is_active !== undefined) {
      params.push(is_active === 'true');
      query += ` AND dc.is_active = $${params.length}`;
    }
    
    query += `
      GROUP BY dc.id
      ORDER BY dc.created_at DESC
    `;
    
    const result = await pool.query(query, params);
    
    logger.info('GET', `/api/drip-campaigns/${company_id}`, 200);
    return successResponse(res, result.rows, 'Drip campaigns retrieved successfully');
    
  } catch (error) {
    logger.error('Get drip campaigns error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get campaign details with steps
exports.getCampaignDetails = async (req, res) => {
  try {
    const { company_id, campaign_id } = req.params;
    
    const campaignResult = await pool.query(`
      SELECT * FROM drip_campaigns
      WHERE id = $1 AND company_id = $2
    `, [campaign_id, company_id]);
    
    if (campaignResult.rows.length === 0) {
      return errorResponse(res, 'Campaign not found', 404);
    }
    
    const stepsResult = await pool.query(`
      SELECT * FROM drip_campaign_steps
      WHERE campaign_id = $1
      ORDER BY step_number ASC
    `, [campaign_id]);
    
    logger.info('GET', `/api/drip-campaigns/${company_id}/${campaign_id}`, 200);
    return successResponse(res, {
      ...campaignResult.rows[0],
      steps: stepsResult.rows
    }, 'Campaign details retrieved successfully');
    
  } catch (error) {
    logger.error('Get campaign details error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Update drip campaign
exports.updateDripCampaign = async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { campaign_name, description, is_active, trigger_conditions } = req.body;
    
    const updates = [];
    const params = [];
    let paramCount = 0;
    
    if (campaign_name) {
      paramCount++;
      updates.push(`campaign_name = $${paramCount}`);
      params.push(campaign_name);
    }
    
    if (description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      params.push(description);
    }
    
    if (is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      params.push(is_active);
    }
    
    if (trigger_conditions) {
      paramCount++;
      updates.push(`trigger_conditions = $${paramCount}`);
      params.push(JSON.stringify(trigger_conditions));
    }
    
    if (updates.length === 0) {
      return errorResponse(res, 'No fields to update', 400);
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(campaign_id);
    
    const query = `
      UPDATE drip_campaigns
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'Campaign not found', 404);
    }
    
    logger.info('PATCH', `/api/drip-campaigns/${campaign_id}`, 200);
    return successResponse(res, result.rows[0], 'Campaign updated successfully');
    
  } catch (error) {
    logger.error('Update campaign error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Subscribe lead to campaign
exports.subscribeToCampaign = async (req, res) => {
  try {
    const { campaign_id, lead_id } = req.body;
    
    if (!campaign_id || !lead_id) {
      return errorResponse(res, 'campaign_id and lead_id are required', 400);
    }
    
    const existingResult = await pool.query(`
      SELECT * FROM drip_campaign_subscribers
      WHERE campaign_id = $1 AND lead_id = $2
    `, [campaign_id, lead_id]);
    
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      
      if (existing.status === 'unsubscribed') {
        return errorResponse(res, 'Lead has unsubscribed from this campaign', 400);
      }
      
      return errorResponse(res, 'Lead is already subscribed to this campaign', 400);
    }
    
    const result = await pool.query(`
      INSERT INTO drip_campaign_subscribers (
        campaign_id, lead_id, current_step, status, started_at
      )
      VALUES ($1, $2, 0, 'active', NOW())
      RETURNING *
    `, [campaign_id, lead_id]);
    
    await pool.query(`
      UPDATE drip_campaigns
      SET total_subscribers = total_subscribers + 1
      WHERE id = $1
    `, [campaign_id]);
    
    await dripCampaignService.scheduleNextDripStep(result.rows[0].id);
    
    logger.info('POST', '/api/drip-campaigns/subscribe', 201);
    return successResponse(res, result.rows[0], 'Lead subscribed to campaign successfully', 201);
    
  } catch (error) {
    logger.error('Subscribe to campaign error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Unsubscribe from campaign
exports.unsubscribeFromCampaign = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      lead_id,
      company_id,
      unsubscribe_type = 'all',
      campaign_id,
      reason,
      ip_address,
      user_agent
    } = req.body;
    
    if (!lead_id) {
      return errorResponse(res, 'lead_id is required', 400);
    }
    
    let finalCompanyId = company_id;
    if (!finalCompanyId && lead_id) {
      const leadResult = await client.query(
        'SELECT company_id FROM leads WHERE id = $1',
        [lead_id]
      );
      if (leadResult.rows.length > 0) {
        finalCompanyId = leadResult.rows[0].company_id;
      }
    }
    
    if (!finalCompanyId) {
      return errorResponse(res, 'company_id could not be determined. Please provide company_id or valid lead_id', 400);
    }
    
    await client.query(`
      INSERT INTO unsubscribes (
        lead_id, company_id, unsubscribe_type,
        campaign_id, reason, ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (lead_id, unsubscribe_type, campaign_id) DO UPDATE
      SET unsubscribed_at = NOW(), reason = EXCLUDED.reason
    `, [
      lead_id,
      finalCompanyId,
      unsubscribe_type,
      campaign_id || null,
      reason || null,
      ip_address || null,
      user_agent || null
    ]);
    
    if (campaign_id) {
      await client.query(`
        UPDATE drip_campaign_subscribers
        SET status = 'unsubscribed', unsubscribed_at = NOW()
        WHERE lead_id = $1 AND campaign_id = $2
      `, [lead_id, campaign_id]);
    } else if (unsubscribe_type === 'all') {
      await client.query(`
        UPDATE drip_campaign_subscribers
        SET status = 'unsubscribed', unsubscribed_at = NOW()
        WHERE lead_id = $1
      `, [lead_id]);
    }
    
    await client.query(`
      UPDATE drip_step_executions dse
      SET status = 'skipped', error_message = 'Lead unsubscribed'
      FROM drip_campaign_subscribers dcs
      WHERE dse.subscriber_id = dcs.id
      AND dcs.lead_id = $1
      AND dse.status = 'pending'
      ${campaign_id ? 'AND dcs.campaign_id = $2' : ''}
    `, campaign_id ? [lead_id, campaign_id] : [lead_id]);
    
    await client.query('COMMIT');
    
    logger.info('POST', '/api/drip-campaigns/unsubscribe', 200);
    return successResponse(res, null, 'Unsubscribed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Unsubscribe error:', error);
    return errorResponse(res, error.message, 500);
  } finally {
    client.release();
  }
};

// Get campaign subscribers
exports.getCampaignSubscribers = async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { status } = req.query;
    
    let query = `
      SELECT 
        dcs.*,
        l.name as lead_name,
        l.email,
        l.phone_number,
        l.lead_status
      FROM drip_campaign_subscribers dcs
      JOIN leads l ON dcs.lead_id = l.id
      WHERE dcs.campaign_id = $1
    `;
    
    const params = [campaign_id];
    
    if (status) {
      params.push(status);
      query += ` AND dcs.status = $${params.length}`;
    }
    
    query += ' ORDER BY dcs.created_at DESC';
    
    const result = await pool.query(query, params);
    
    logger.info('GET', `/api/drip-campaigns/subscribers/${campaign_id}`, 200);
    return successResponse(res, result.rows, 'Campaign subscribers retrieved successfully');
    
  } catch (error) {
    logger.error('Get campaign subscribers error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get execution history
exports.getExecutionHistory = async (req, res) => {
  try {
    const { lead_id } = req.params;
    const { campaign_id } = req.query;
    
    let query = `
      SELECT 
        dse.*,
        dcs.step_type,
        dcs.step_number,
        dcs.subject,
        dc.campaign_name,
        l.name as lead_name
      FROM drip_step_executions dse
      JOIN drip_campaign_steps dcs ON dse.step_id = dcs.id
      JOIN drip_campaign_subscribers dcsu ON dse.subscriber_id = dcsu.id
      JOIN drip_campaigns dc ON dcsu.campaign_id = dc.id
      JOIN leads l ON dse.lead_id = l.id
      WHERE dse.lead_id = $1
    `;
    
    const params = [lead_id];
    
    if (campaign_id) {
      params.push(campaign_id);
      query += ` AND dcsu.campaign_id = $${params.length}`;
    }
    
    query += ' ORDER BY dse.created_at DESC';
    
    const result = await pool.query(query, params);
    
    logger.info('GET', `/api/drip-campaigns/executions/${lead_id}`, 200);
    return successResponse(res, result.rows, 'Execution history retrieved successfully');
    
  } catch (error) {
    logger.error('Get execution history error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get campaign performance
exports.getCampaignPerformance = async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    const params = [campaign_id];
    
    if (start_date && end_date) {
      params.push(start_date, end_date);
      dateFilter = ` AND date BETWEEN $2 AND $3`;
    }
    
    const performanceResult = await pool.query(`
      SELECT 
        SUM(messages_sent) as total_sent,
        SUM(messages_delivered) as total_delivered,
        SUM(messages_opened) as total_opened,
        SUM(messages_clicked) as total_clicked,
        SUM(messages_failed) as total_failed,
        SUM(unsubscribes) as total_unsubscribes,
        SUM(leads_converted) as total_conversions,
        SUM(revenue_generated) as total_revenue,
        SUM(total_cost) as total_cost,
        CASE 
          WHEN SUM(messages_sent) > 0 
          THEN (SUM(messages_delivered)::float / SUM(messages_sent) * 100)
          ELSE 0 
        END as delivery_rate,
        CASE 
          WHEN SUM(messages_delivered) > 0 
          THEN (SUM(messages_opened)::float / SUM(messages_delivered) * 100)
          ELSE 0 
        END as open_rate,
        CASE 
          WHEN SUM(messages_opened) > 0 
          THEN (SUM(messages_clicked)::float / SUM(messages_opened) * 100)
          ELSE 0 
        END as click_rate,
        CASE 
          WHEN SUM(messages_sent) > 0 
          THEN (SUM(leads_converted)::float / SUM(messages_sent) * 100)
          ELSE 0 
        END as conversion_rate,
        CASE 
          WHEN SUM(total_cost) > 0 
          THEN (SUM(revenue_generated) - SUM(total_cost))
          ELSE 0 
        END as net_profit,
        CASE 
          WHEN SUM(total_cost) > 0 
          THEN ((SUM(revenue_generated) - SUM(total_cost)) / SUM(total_cost) * 100)
          ELSE 0 
        END as roi
      FROM campaign_performance
      WHERE campaign_id = $1 ${dateFilter}
    `, params);
    
    const subscriberStats = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM drip_campaign_subscribers
      WHERE campaign_id = $1
      GROUP BY status
    `, [campaign_id]);
    
    const stepPerformance = await pool.query(`
      SELECT 
        dcs.step_number,
        dcs.step_type,
        COUNT(dse.id) as total_executions,
        COUNT(dse.id) FILTER (WHERE dse.status = 'sent') as sent,
        COUNT(dse.id) FILTER (WHERE dse.status = 'failed') as failed,
        COUNT(dse.id) FILTER (WHERE dse.opened_at IS NOT NULL) as opened,
        COUNT(dse.id) FILTER (WHERE dse.clicked_at IS NOT NULL) as clicked
      FROM drip_campaign_steps dcs
      LEFT JOIN drip_step_executions dse ON dcs.id = dse.step_id
      WHERE dcs.campaign_id = $1
      GROUP BY dcs.id, dcs.step_number, dcs.step_type
      ORDER BY dcs.step_number
    `, [campaign_id]);
    
    logger.info('GET', `/api/drip-campaigns/${campaign_id}/performance`, 200);
    return successResponse(res, {
      overall_metrics: performanceResult.rows[0],
      subscriber_stats: subscriberStats.rows,
      step_performance: stepPerformance.rows
    }, 'Campaign performance retrieved successfully');
    
  } catch (error) {
    logger.error('Get campaign performance error:', error);
    return errorResponse(res, error.message, 500);
  }
};