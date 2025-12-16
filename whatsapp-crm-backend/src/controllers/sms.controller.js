const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');
const smsService = require('../services/sms/smsService');

// ============================================
// SMS CONFIGURATION MANAGEMENT
// ============================================

exports.createSmsConfig = async (req, res) => {
  try {
    const {
      company_id,
      provider = 'twilio',
      account_sid,
      auth_token,
      phone_number,
      daily_limit = 1000
    } = req.body;

    if (!company_id || !account_sid || !auth_token || !phone_number) {
      return errorResponse(res, 'company_id, account_sid, auth_token, and phone_number are required', 400);
    }

    // Verify Twilio credentials
    const isValid = await smsService.verifyTwilioCredentials(account_sid, auth_token, phone_number);
    if (!isValid) {
      return errorResponse(res, 'Invalid Twilio credentials or phone number', 400);
    }

    const result = await pool.query(`
      INSERT INTO sms_configs (
        company_id, provider, account_sid, auth_token,
        phone_number, daily_limit, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      ON CONFLICT (company_id, phone_number) DO UPDATE
      SET 
        account_sid = EXCLUDED.account_sid,
        auth_token = EXCLUDED.auth_token,
        daily_limit = EXCLUDED.daily_limit,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, company_id, phone_number, daily_limit, is_active
    `, [company_id, provider, account_sid, auth_token, phone_number, daily_limit]);

    logger.info('POST', '/api/sms/config', 201);
    return successResponse(res, result.rows[0], 'SMS configuration saved successfully', 201);
  } catch (error) {
    logger.error('Create SMS config error:', error);
    return errorResponse(res, error.message, 500);
  }
};

exports.getSmsConfigs = async (req, res) => {
  try {
    const { company_id } = req.params;

    const result = await pool.query(`
      SELECT 
        id, company_id, provider, phone_number,
        daily_limit, messages_sent_today, last_reset_at,
        is_active, created_at, updated_at
      FROM sms_configs
      WHERE company_id = $1
      ORDER BY created_at DESC
    `, [company_id]);

    logger.info('GET', `/api/sms/config/${company_id}`, 200);
    return successResponse(res, result.rows, 'SMS configurations retrieved successfully');
  } catch (error) {
    logger.error('Get SMS configs error:', error);
    return errorResponse(res, error.message, 500);
  }
};

exports.toggleSmsConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const result = await pool.query(`
      UPDATE sms_configs
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [is_active, id]);

    if (result.rows.length === 0) {
      return errorResponse(res, 'SMS config not found', 404);
    }

    logger.info('PATCH', `/api/sms/config/${id}/toggle`, 200);
    return successResponse(res, result.rows[0], 'SMS config updated successfully');
  } catch (error) {
    logger.error('Toggle SMS config error:', error);
    return errorResponse(res, error.message, 500);
  }
};

exports.deleteSmsConfig = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM sms_configs WHERE id = $1', [id]);

    logger.info('DELETE', `/api/sms/config/${id}`, 200);
    return successResponse(res, null, 'SMS configuration deleted successfully');
  } catch (error) {
    logger.error('Delete SMS config error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// SEND SMS
// ============================================

exports.sendSms = async (req, res) => {
  try {
    const {
      company_id,
      lead_id,
      to_number,
      message_body,
      template_id
    } = req.body;

    if (!company_id || !to_number || (!message_body && !template_id)) {
      return errorResponse(res, 'company_id, to_number, and message_body or template_id are required', 400);
    }

    // Get active SMS config
    const configResult = await pool.query(`
      SELECT * FROM sms_configs
      WHERE company_id = $1 AND is_active = TRUE
      LIMIT 1
    `, [company_id]);

    if (configResult.rows.length === 0) {
      return errorResponse(res, 'No active SMS configuration found', 404);
    }

    const config = configResult.rows[0];

    // Check daily limit
    if (config.messages_sent_today >= config.daily_limit) {
      return errorResponse(res, 'Daily SMS limit reached', 429);
    }

    let finalMessage = message_body;

    // If template_id provided, get template
    if (template_id) {
      const templateResult = await pool.query(
        'SELECT * FROM sms_templates WHERE id = $1 AND company_id = $2',
        [template_id, company_id]
      );

      if (templateResult.rows.length === 0) {
        return errorResponse(res, 'Template not found', 404);
      }

      finalMessage = templateResult.rows[0].message_body;

      // Replace variables if lead_id provided
      if (lead_id) {
        const leadResult = await pool.query(
          'SELECT * FROM leads WHERE id = $1',
          [lead_id]
        );

        if (leadResult.rows.length > 0) {
          const lead = leadResult.rows[0];
          finalMessage = finalMessage
            .replace(/\{\{name\}\}/g, lead.name || '')
            .replace(/\{\{phone\}\}/g, lead.phone_number || '')
            .replace(/\{\{email\}\}/g, lead.email || '');
        }
      }
    }

    // Send SMS via Twilio
    const result = await smsService.sendSms({
      account_sid: config.account_sid,
      auth_token: config.auth_token,
      from: config.phone_number,
      to: to_number,
      body: finalMessage
    });

    // Save to database
    const smsResult = await pool.query(`
      INSERT INTO sms_messages (
        sms_config_id, lead_id, direction, from_number,
        to_number, message_body, message_sid, status,
        segments, cost, sent_at
      )
      VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `, [
      config.id,
      lead_id || null,
      config.phone_number,
      to_number,
      finalMessage,
      result.sid,
      result.status,
      result.numSegments,
      parseFloat(result.price) || 0
    ]);

    // Update daily count
    await pool.query(`
      UPDATE sms_configs
      SET messages_sent_today = messages_sent_today + 1
      WHERE id = $1
    `, [config.id]);

    logger.info('POST', '/api/sms/send', 200);
    return successResponse(res, smsResult.rows[0], 'SMS sent successfully');
  } catch (error) {
    logger.error('Send SMS error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// SMS TEMPLATES
// ============================================

exports.createSmsTemplate = async (req, res) => {
  try {
    const {
      company_id,
      template_name,
      template_type,
      message_body,
      variables = []
    } = req.body;

    if (!company_id || !template_name || !message_body) {
      return errorResponse(res, 'company_id, template_name, and message_body are required', 400);
    }

    const charCount = message_body.length;
    const segments = Math.ceil(charCount / 160);

    const result = await pool.query(`
      INSERT INTO sms_templates (
        company_id, template_name, template_type,
        message_body, variables, character_count,
        estimated_segments, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      RETURNING *
    `, [company_id, template_name, template_type, message_body, variables, charCount, segments]);

    logger.info('POST', '/api/sms/templates', 201);
    return successResponse(res, result.rows[0], 'SMS template created successfully', 201);
  } catch (error) {
    logger.error('Create SMS template error:', error);
    return errorResponse(res, error.message, 500);
  }
};

exports.getSmsTemplates = async (req, res) => {
  try {
    const { company_id } = req.params;
    const { template_type, is_active } = req.query;

    let query = 'SELECT * FROM sms_templates WHERE company_id = $1';
    const params = [company_id];

    if (template_type) {
      params.push(template_type);
      query += ` AND template_type = $${params.length}`;
    }

    if (is_active !== undefined) {
      params.push(is_active === 'true');
      query += ` AND is_active = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    logger.info('GET', `/api/sms/templates/${company_id}`, 200);
    return successResponse(res, result.rows, 'SMS templates retrieved successfully');
  } catch (error) {
    logger.error('Get SMS templates error:', error);
    return errorResponse(res, error.message, 500);
  }
};

exports.updateSmsTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { template_name, message_body, is_active } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 0;

    if (template_name) {
      paramCount++;
      updates.push(`template_name = $${paramCount}`);
      params.push(template_name);
    }

    if (message_body) {
      paramCount++;
      updates.push(`message_body = $${paramCount}`);
      params.push(message_body);

      paramCount++;
      updates.push(`character_count = $${paramCount}`);
      params.push(message_body.length);

      paramCount++;
      updates.push(`estimated_segments = $${paramCount}`);
      params.push(Math.ceil(message_body.length / 160));
    }

    if (is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      params.push(is_active);
    }

    if (updates.length === 0) {
      return errorResponse(res, 'No fields to update', 400);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(id);

    const query = `
      UPDATE sms_templates
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return errorResponse(res, 'Template not found', 404);
    }

    logger.info('PATCH', `/api/sms/templates/${id}`, 200);
    return successResponse(res, result.rows[0], 'SMS template updated successfully');
  } catch (error) {
    logger.error('Update SMS template error:', error);
    return errorResponse(res, error.message, 500);
  }
};

exports.deleteSmsTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM sms_templates WHERE id = $1', [id]);

    logger.info('DELETE', `/api/sms/templates/${id}`, 200);
    return successResponse(res, null, 'SMS template deleted successfully');
  } catch (error) {
    logger.error('Delete SMS template error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// SMS CAMPAIGNS
// ============================================

exports.createSmsCampaign = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      company_id,
      campaign_name,
      template_id,
      target_audience,
      scheduled_for,
      recipient_lead_ids
    } = req.body;

    if (!company_id || !campaign_name || !template_id) {
      return errorResponse(res, 'company_id, campaign_name, and template_id are required', 400);
    }

    // Create campaign
    const campaignResult = await client.query(`
      INSERT INTO sms_campaigns (
        company_id, campaign_name, template_id,
        target_audience, scheduled_for, status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      company_id,
      campaign_name,
      template_id,
      JSON.stringify(target_audience || {}),
      scheduled_for || null,
      scheduled_for ? 'scheduled' : 'draft'
    ]);

    const campaign_id = campaignResult.rows[0].id;

    // Add recipients
    if (recipient_lead_ids && Array.isArray(recipient_lead_ids)) {
      for (const lead_id of recipient_lead_ids) {
        const leadResult = await client.query(
          'SELECT phone_number FROM leads WHERE id = $1',
          [lead_id]
        );

        if (leadResult.rows.length > 0) {
          await client.query(`
            INSERT INTO sms_campaign_recipients (
              campaign_id, lead_id, phone_number, status
            )
            VALUES ($1, $2, $3, 'pending')
          `, [campaign_id, lead_id, leadResult.rows[0].phone_number]);
        }
      }

      await client.query(`
        UPDATE sms_campaigns
        SET total_recipients = $1
        WHERE id = $2
      `, [recipient_lead_ids.length, campaign_id]);
    }

    await client.query('COMMIT');

    logger.info('POST', '/api/sms/campaigns', 201);
    return successResponse(res, campaignResult.rows[0], 'SMS campaign created successfully', 201);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Create SMS campaign error:', error);
    return errorResponse(res, error.message, 500);
  } finally {
    client.release();
  }
};

exports.getSmsCampaigns = async (req, res) => {
  try {
    const { company_id } = req.params;
    const { status } = req.query;

    let query = `
      SELECT 
        sc.*,
        st.template_name,
        COUNT(scr.id) FILTER (WHERE scr.status = 'sent') as sent_count,
        COUNT(scr.id) FILTER (WHERE scr.status = 'delivered') as delivered_count,
        COUNT(scr.id) FILTER (WHERE scr.status = 'failed') as failed_count
      FROM sms_campaigns sc
      LEFT JOIN sms_templates st ON sc.template_id = st.id
      LEFT JOIN sms_campaign_recipients scr ON sc.id = scr.campaign_id
      WHERE sc.company_id = $1
    `;

    const params = [company_id];

    if (status) {
      params.push(status);
      query += ` AND sc.status = $${params.length}`;
    }

    query += ' GROUP BY sc.id, st.template_name ORDER BY sc.created_at DESC';

    const result = await pool.query(query, params);

    logger.info('GET', `/api/sms/campaigns/${company_id}`, 200);
    return successResponse(res, result.rows, 'SMS campaigns retrieved successfully');
  } catch (error) {
    logger.error('Get SMS campaigns error:', error);
    return errorResponse(res, error.message, 500);
  }
};

exports.getCampaignDetails = async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const campaignResult = await pool.query(
      'SELECT * FROM sms_campaigns WHERE id = $1',
      [campaign_id]
    );

    if (campaignResult.rows.length === 0) {
      return errorResponse(res, 'Campaign not found', 404);
    }

    const recipientsResult = await pool.query(`
      SELECT 
        scr.*,
        l.name as lead_name,
        l.email
      FROM sms_campaign_recipients scr
      LEFT JOIN leads l ON scr.lead_id = l.id
      WHERE scr.campaign_id = $1
      ORDER BY scr.created_at DESC
    `, [campaign_id]);

    logger.info('GET', `/api/sms/campaigns/details/${campaign_id}`, 200);
    return successResponse(res, {
      ...campaignResult.rows[0],
      recipients: recipientsResult.rows
    }, 'Campaign details retrieved successfully');
  } catch (error) {
    logger.error('Get campaign details error:', error);
    return errorResponse(res, error.message, 500);
  }
};

exports.executeCampaign = async (req, res) => {
  try {
    const { campaign_id } = req.params;

    // Update campaign status
    await pool.query(
      'UPDATE sms_campaigns SET status = $1 WHERE id = $2',
      ['running', campaign_id]
    );

    // Trigger campaign execution (this will be handled by the scheduler)
    logger.info('POST', `/api/sms/campaigns/${campaign_id}/execute`, 200);
    return successResponse(res, null, 'Campaign execution started');
  } catch (error) {
    logger.error('Execute campaign error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// SMS HISTORY
// ============================================

exports.getSmsHistory = async (req, res) => {
  try {
    const { company_id } = req.params;
    const { lead_id, direction, status, limit = 50 } = req.query;

    let query = `
      SELECT 
        sm.*,
        l.name as lead_name,
        l.email
      FROM sms_messages sm
      LEFT JOIN leads l ON sm.lead_id = l.id
      JOIN sms_configs sc ON sm.sms_config_id = sc.id
      WHERE sc.company_id = $1
    `;

    const params = [company_id];

    if (lead_id) {
      params.push(lead_id);
      query += ` AND sm.lead_id = $${params.length}`;
    }

    if (direction) {
      params.push(direction);
      query += ` AND sm.direction = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND sm.status = $${params.length}`;
    }

    query += ` ORDER BY sm.created_at DESC LIMIT ${parseInt(limit)}`;

    const result = await pool.query(query, params);

    logger.info('GET', `/api/sms/history/${company_id}`, 200);
    return successResponse(res, result.rows, 'SMS history retrieved successfully');
  } catch (error) {
    logger.error('Get SMS history error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// INBOUND SMS WEBHOOK
// ============================================

exports.handleInboundSms = async (req, res) => {
  try {
    const {
      MessageSid,
      From,
      To,
      Body,
      NumSegments,
      SmsStatus
    } = req.body;

    // Get SMS config
    const configResult = await pool.query(
      'SELECT * FROM sms_configs WHERE phone_number = $1',
      [To]
    );

    if (configResult.rows.length === 0) {
      return res.status(404).send('SMS config not found');
    }

    const config = configResult.rows[0];

    // Find or create lead
    let leadId = null;
    const leadResult = await pool.query(
      'SELECT id FROM leads WHERE phone_number = $1',
      [From]
    );

    if (leadResult.rows.length > 0) {
      leadId = leadResult.rows[0].id;
    } else {
      const newLead = await pool.query(`
        INSERT INTO leads (
          company_id, phone_number, name, lead_source
        )
        VALUES ($1, $2, $3, 'sms_inbound')
        RETURNING id
      `, [config.company_id, From, 'SMS Lead']);
      leadId = newLead.rows[0].id;
    }

    // Save inbound SMS
    await pool.query(`
      INSERT INTO sms_messages (
        sms_config_id, lead_id, direction, from_number,
        to_number, message_body, message_sid, status,
        segments, sent_at
      )
      VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, $8, NOW())
    `, [
      config.id,
      leadId,
      From,
      To,
      Body,
      MessageSid,
      SmsStatus,
      parseInt(NumSegments) || 1
    ]);

    // Update conversation
    await pool.query(`
      INSERT INTO conversations (
        lead_id, phone_number, conversation_history, sentiment
      )
      VALUES ($1, $2, $3, 'neutral')
      ON CONFLICT (phone_number) DO UPDATE
      SET 
        conversation_history = conversations.conversation_history || 
          E'\\n\\nUser: ' || $3 ||
          E'\\n[SMS received at: ' || NOW() || ']',
        updated_at = CURRENT_TIMESTAMP
    `, [leadId, From, Body]);

    logger.info('POST', '/api/sms/webhook/inbound', 200);
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Handle inbound SMS error:', error);
    res.status(500).send('Error processing SMS');
  }
};

module.exports = exports;