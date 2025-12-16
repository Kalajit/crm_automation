const pool = require('../config/database');
const { handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

// ============================================
// LEAD WORKFLOW ENDPOINTS (For n8n)
// ============================================

exports.checkLead = async (req, res) => {
  try {
    const { phone_number } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number required' });
    }
    
    const result = await pool.query(
      'SELECT id, tags, metadata FROM leads WHERE phone_number = $1 LIMIT 1',
      [phone_number]
    );
    
    if (result.rows.length === 0) {
      return res.json({ 
        success: true, 
        exists: false,
        lead: null 
      });
    }
    
    res.json({ 
      success: true, 
      exists: true,
      lead: result.rows[0] 
    });
  } catch (error) {
    console.error('Check lead error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.createLead = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      company_id,
      phone_number,
      name,
      email,
      platform,
      form_id,
      tags,
      raw_data,
      mapped_data
    } = req.body;
    
    if (!company_id || !phone_number || !platform) {
      throw new Error('company_id, phone_number, and platform are required');
    }
    
    const leadResult = await client.query(`
      INSERT INTO leads (
        company_id, phone_number, name, email, lead_source,
        lead_status, tags, metadata
      )
      VALUES ($1, $2, $3, $4, $5, 'new', $6, $7)
      RETURNING *
    `, [
      company_id,
      phone_number,
      name || 'New Lead',
      email,
      platform,
      tags || [platform],
      JSON.stringify({ [platform]: raw_data })
    ]);
    
    const leadId = leadResult.rows[0].id;
    
    await client.query(`
      INSERT INTO conversations (lead_id, phone_number, conversation_history)
      VALUES ($1, $2, '')
      ON CONFLICT (lead_id) DO NOTHING
    `, [leadId, phone_number]);
    
    await client.query(`
      INSERT INTO lead_import_logs (
        company_id, platform, lead_id, form_id,
        raw_data, mapped_data, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'success')
    `, [
      company_id,
      platform,
      leadId,
      form_id,
      JSON.stringify(raw_data),
      JSON.stringify(mapped_data)
    ]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      lead: leadResult.rows[0] 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create lead error:', error);
    
    try {
      await pool.query(`
        INSERT INTO lead_import_logs (
          company_id, platform, form_id, raw_data, status, error_message
        )
        VALUES ($1, $2, $3, $4, 'failed', $5)
      `, [
        req.body.company_id || 0,
        req.body.platform || 'unknown',
        req.body.form_id || 'unknown',
        JSON.stringify(req.body.raw_data),
        error.message
      ]);
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

exports.updateLead = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      phone_number,
      name,
      email,
      platform,
      form_id,
      tags,
      raw_data,
      mapped_data,
      company_id
    } = req.body;
    
    if (!phone_number || !platform) {
      throw new Error('phone_number and platform are required');
    }
    
    const existingResult = await client.query(
      'SELECT id, tags FROM leads WHERE phone_number = $1',
      [phone_number]
    );
    
    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const existingLead = existingResult.rows[0];
    const mergedTags = Array.from(new Set([
      ...(existingLead.tags || []),
      ...(tags || [platform])
    ]));
    
    const updateResult = await client.query(`
      UPDATE leads
      SET 
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        lead_source = $3,
        tags = $4,
        metadata = metadata || $5::jsonb,
        last_contacted = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE phone_number = $6
      RETURNING *
    `, [
      name,
      email,
      platform,
      mergedTags,
      JSON.stringify({ [platform]: raw_data }),
      phone_number
    ]);
    
    await client.query(`
      INSERT INTO lead_import_logs (
        company_id, platform, lead_id, form_id,
        raw_data, mapped_data, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'duplicate')
    `, [
      company_id,
      platform,
      existingLead.id,
      form_id,
      JSON.stringify(raw_data),
      JSON.stringify(mapped_data)
    ]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      lead: updateResult.rows[0] 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update lead error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

exports.sendWelcome = async (req, res) => {
  try {
    const { lead_id, phone_number, name } = req.body;
    
    if (!lead_id || !phone_number) {
      return res.status(400).json({ error: 'lead_id and phone_number required' });
    }
    
    const firstName = (name || 'there').trim().split(' ')[0];
    const message = `Hi ${firstName}! Thanks for your interest. We'll contact you within 24 hours.`;
    
    await pool.query(`
      INSERT INTO notifications (
        lead_id, phone_number, notification_type, title, message,
        delivery_channel, scheduled_time, status
      )
      VALUES ($1, $2, 'welcome', 'Welcome!', $3, 'whatsapp', CURRENT_TIMESTAMP, 'pending')
    `, [lead_id, phone_number, message]);
    
    res.json({ success: true, message: 'Welcome notification queued' });
  } catch (error) {
    console.error('Send welcome error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.scheduleCall = async (req, res) => {
  try {
    const { company_id, lead_id, hours_delay } = req.body;
    
    if (!company_id || !lead_id) {
      return res.status(400).json({ error: 'company_id and lead_id required' });
    }
    
    const delay = hours_delay || 2;
    const scheduledTime = new Date(Date.now() + delay * 60 * 60 * 1000);
    
    await pool.query(`
      INSERT INTO scheduled_calls (company_id, lead_id, call_type, scheduled_time, status)
      VALUES ($1, $2, 'qualification', $3, 'pending')
    `, [company_id, lead_id, scheduledTime.toISOString()]);
    
    res.json({ 
      success: true, 
      scheduled_time: scheduledTime.toISOString(),
      message: 'Follow-up call scheduled' 
    });
  } catch (error) {
    console.error('Schedule call error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.logImport = async (req, res) => {
  try {
    const {
      company_id,
      platform,
      lead_id,
      form_id,
      raw_data,
      mapped_data,
      status,
      error_message
    } = req.body;
    
    await pool.query(`
      INSERT INTO lead_import_logs (
        company_id, platform, lead_id, form_id,
        raw_data, mapped_data, status, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      company_id || 0,
      platform || 'unknown',
      lead_id,
      form_id,
      JSON.stringify(raw_data),
      JSON.stringify(mapped_data),
      status || 'success',
      error_message
    ]);
    
    res.json({ success: true, message: 'Import logged' });
  } catch (error) {
    console.error('Log import error:', error);
    res.status(500).json({ error: error.message });
  }
};