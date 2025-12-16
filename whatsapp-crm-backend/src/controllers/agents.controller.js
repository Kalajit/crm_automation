const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Create or update agent config
 */
exports.createOrUpdateAgentConfig = async (req, res) => {
  try {
    const { company_id, prompt_key, prompt_preamble, initial_message, voice } = req.body;
    
    const query = `
      INSERT INTO agent_configs (company_id, prompt_key, prompt_preamble, initial_message, voice)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (company_id, prompt_key) DO UPDATE
      SET prompt_preamble = EXCLUDED.prompt_preamble,
          initial_message = EXCLUDED.initial_message,
          voice = EXCLUDED.voice,
          updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    
    const result = await pool.query(query, [company_id, prompt_key, prompt_preamble, initial_message, voice]);
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * Get agent configs by company
 */
exports.getAgentConfigsByCompany = async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const query = `SELECT * FROM agent_configs WHERE company_id = $1 AND is_active = TRUE;`;
    const result = await pool.query(query, [company_id]);
    
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * Create agent instance
 */
exports.createAgentInstance = async (req, res) => {
  try {
    const { 
      company_id, 
      agent_name, 
      agent_type, 
      phone_number, 
      whatsapp_number,
      agent_config_id,
      custom_prompt,
      custom_voice,
      metadata
    } = req.body;

    if (!company_id || !agent_name || !agent_type) {
      return res.status(400).json({ error: 'company_id, agent_name, and agent_type are required' });
    }

    const query = `
      INSERT INTO agent_instances 
      (company_id, agent_name, agent_type, phone_number, whatsapp_number, agent_config_id, custom_prompt, custom_voice, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      company_id,
      agent_name,
      agent_type,
      phone_number || null,
      whatsapp_number || null,
      agent_config_id || null,
      custom_prompt || null,
      custom_voice || null,
      metadata ? JSON.stringify(metadata) : null
    ]);

    logRequest('POST', '/api/agent-instances', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/agent-instances', 500);
    handleError(res, error);
  }
};

/**
 * Get agent instances by company
 */
exports.getAgentInstancesByCompany = async (req, res) => {
  try {
    const { company_id } = req.params;
    const { agent_type } = req.query;

    let query = `
      SELECT ai.*, ac.prompt_key, ac.voice as default_voice, ac.model_name
      FROM agent_instances ai
      LEFT JOIN agent_configs ac ON ai.agent_config_id = ac.id
      WHERE ai.company_id = $1
    `;
    
    const params = [company_id];
    
    if (agent_type) {
      query += ` AND ai.agent_type = $2`;
      params.push(agent_type);
    }
    
    query += ` ORDER BY ai.created_at DESC;`;

    const result = await pool.query(query, params);

    logRequest('GET', `/api/agent-instances/company/${company_id}`, 200);
    sendSuccess(res, { count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/agent-instances/company/${company_id}`, 500);
    handleError(res, error);
  }
};

/**
 * Get agent instance by ID
 */
exports.getAgentInstanceById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT ai.*, ac.prompt_preamble, ac.initial_message, ac.voice as default_voice, ac.model_name
      FROM agent_instances ai
      LEFT JOIN agent_configs ac ON ai.agent_config_id = ac.id
      WHERE ai.id = $1;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent instance not found' });
    }

    logRequest('GET', `/api/agent-instances/${id}`, 200);
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/agent-instances/${id}`, 500);
    handleError(res, error);
  }
};

/**
 * Get agent instance by phone
 */
exports.getAgentInstanceByPhone = async (req, res) => {
  try {
    const { phone } = req.params;

    const query = `
      SELECT ai.*, ac.prompt_preamble, ac.initial_message, ac.voice as default_voice, ac.model_name, c.name as company_name
      FROM agent_instances ai
      LEFT JOIN agent_configs ac ON ai.agent_config_id = ac.id
      LEFT JOIN companies c ON ai.company_id = c.id
      WHERE (ai.phone_number = $1 OR ai.whatsapp_number = $1)
      AND ai.is_active = TRUE
      LIMIT 1;
    `;

    const result = await pool.query(query, [phone]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No active agent found for this number' });
    }

    logRequest('GET', `/api/agent-instances/phone/${phone}`, 200);
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/agent-instances/phone/${phone}`, 500);
    handleError(res, error);
  }
};

/**
 * Update agent instance
 */
exports.updateAgentInstance = async (req, res) => {
  try {
    const { id } = req.params;
    const { agent_name, phone_number, whatsapp_number, custom_prompt, custom_voice, is_active, metadata } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 0;

    if (agent_name) {
      paramCount++;
      updates.push(`agent_name = ${paramCount}`);
      params.push(agent_name);
    }
    if (phone_number !== undefined) {
      paramCount++;
      updates.push(`phone_number = ${paramCount}`);
      params.push(phone_number);
    }
    if (whatsapp_number !== undefined) {
      paramCount++;
      updates.push(`whatsapp_number = ${paramCount}`);
      params.push(whatsapp_number);
    }
    if (custom_prompt !== undefined) {
      paramCount++;
      updates.push(`custom_prompt = ${paramCount}`);
      params.push(custom_prompt);
    }
    if (custom_voice !== undefined) {
      paramCount++;
      updates.push(`custom_voice = ${paramCount}`);
      params.push(custom_voice);
    }
    if (is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = ${paramCount}`);
      params.push(is_active);
    }
    if (metadata) {
      paramCount++;
      updates.push(`metadata = ${paramCount}`);
      params.push(JSON.stringify(metadata));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(id);

    const query = `UPDATE agent_instances SET ${updates.join(', ')} WHERE id = ${paramCount} RETURNING *;`;
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent instance not found' });
    }

    logRequest('PATCH', `/api/agent-instances/${id}`, 200);
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/agent-instances/${id}`, 500);
    handleError(res, error);
  }
};

/**
 * Delete agent instance
 */
exports.deleteAgentInstance = async (req, res) => {
  try {
    const { id } = req.params;
    const query = `DELETE FROM agent_instances WHERE id = $1 RETURNING *;`;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent instance not found' });
    }

    logRequest('DELETE', `/api/agent-instances/${id}`, 200);
    sendSuccess(res, { message: 'Agent instance deleted', data: result.rows[0] });
  } catch (error) {
    logRequest('DELETE', `/api/agent-instances/${id}`, 500);
    handleError(res, error);
  }
};

/**
 * Schedule call
 */
exports.scheduleCall = async (req, res) => {
  try {
    const { company_id, lead_id, call_type, scheduled_time } = req.body;
    const query = `
      INSERT INTO scheduled_calls (company_id, lead_id, call_type, scheduled_time)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await pool.query(query, [company_id, lead_id, call_type, scheduled_time]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * Get pending scheduled calls
 */
exports.getPendingScheduledCalls = async (req, res) => {
  try {
    const query = `
      SELECT sc.*, l.phone_number, l.name, ac.prompt_key, ac.initial_message, ac.voice
      FROM scheduled_calls sc
      JOIN leads l ON sc.lead_id = l.id
      JOIN agent_configs ac ON sc.company_id = ac.company_id
      WHERE sc.status = 'pending' AND sc.scheduled_time <= NOW()
      ORDER BY sc.scheduled_time ASC;
    `;
    const result = await pool.query(query);
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * Update scheduled call
 */
exports.updateScheduledCall = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, call_sid } = req.body;
    
    let query, params;
    
    if (status === 'called' && call_sid) {
      query = `UPDATE scheduled_calls SET status = $1, call_sid = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *;`;
      params = [status, call_sid, id];
    } else if (status === 'failed') {
      query = `UPDATE scheduled_calls SET status = $1, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *;`;
      params = [status, id];
    } else {
      query = `UPDATE scheduled_calls SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *;`;
      params = [status, id];
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Scheduled call not found' });
    }
    
    logRequest('PATCH', `/api/scheduled-calls/${id}`, 200);
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/scheduled-calls/${id}`, 500);
    handleError(res, error);
  }
};

// Call Logs
exports.createCallLog = async (req, res) => {
  try {
    const { company_id, lead_id, call_sid, to_phone, from_phone, call_type, call_status, transcript, sentiment, summary, conversation_history, recording_url } = req.body;
    const query = `
      INSERT INTO call_logs (company_id, lead_id, call_sid, to_phone, from_phone, call_type, call_status, transcript, sentiment, summary, conversation_history, recording_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    const result = await pool.query(query, [company_id, lead_id, call_sid, to_phone, from_phone, call_type, call_status, transcript, sentiment ? JSON.stringify(sentiment) : null, summary ? JSON.stringify(summary) : null, conversation_history ? JSON.stringify(conversation_history) : null, recording_url]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
};

exports.updateCallLog = async (req, res) => {
  try {
    const { call_sid } = req.params;
    const { call_status, call_duration, transcript, sentiment, summary, recording_url } = req.body;
    const query = `
      UPDATE call_logs
      SET call_status = COALESCE($1, call_status),
          call_duration = COALESCE($2, call_duration),
          transcript = COALESCE($3, transcript),
          sentiment = COALESCE($4, sentiment),
          summary = COALESCE($5, summary),
          recording_url = COALESCE($6, recording_url),
          updated_at = CURRENT_TIMESTAMP
      WHERE call_sid = $7
      RETURNING *;
    `;
    const result = await pool.query(query, [call_status, call_duration, transcript, sentiment ? JSON.stringify(sentiment) : null, summary ? JSON.stringify(summary) : null, recording_url, call_sid]);
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
};

exports.getCallLogsByLead = async (req, res) => {
  try {
    const { lead_id } = req.params;
    const query = `SELECT * FROM call_logs WHERE lead_id = $1 ORDER BY created_at DESC;`;
    const result = await pool.query(query, [lead_id]);
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    handleError(res, error);
  }
};

exports.getAllCallLogs = async (req, res) => {
  try {
    const { company_id, call_type, call_status, limit } = req.query;
    
    let query = 'SELECT * FROM call_logs WHERE 1=1';
    const params = [];
    
    if (company_id) {
      params.push(parseInt(company_id));
      query += ` AND company_id = ${params.length}`;
    }
    if (call_type) {
      params.push(call_type);
      query += ` AND call_type = ${params.length}`;
    }
    if (call_status) {
      params.push(call_status);
      query += ` AND call_status = ${params.length}`;
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT ${params.length}`;
    } else {
      query += ' LIMIT 100';
    }
    
    const result = await pool.query(query, params);
    
    logRequest('GET', '/api/call-logs', 200);
    sendSuccess(res, { count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/call-logs', 500);
    handleError(res, error);
  }
};

exports.getCallLogByCallSid = async (req, res) => {
  try {
    const { call_sid } = req.params;
    const query = 'SELECT * FROM call_logs WHERE call_sid = $1;';
    const result = await pool.query(query, [call_sid]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Call log not found' });
    }
    
    logRequest('GET', `/api/call-logs/${call_sid}`, 200);
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/call-logs/${call_sid}`, 500);
    handleError(res, error);
  }
};

exports.exportCallLogsCSV = async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    let query = `
      SELECT 
        cl.call_sid, cl.to_phone, cl.from_phone, cl.call_type, cl.call_status, cl.call_duration, cl.created_at,
        cl.sentiment->>'sentiment' as sentiment, cl.sentiment->>'tone_score' as tone_score,
        cl.summary->>'intent' as intent, cl.summary->>'summary' as summary_text,
        l.name as lead_name, l.email as lead_email, c.name as company_name
      FROM call_logs cl
      LEFT JOIN leads l ON cl.lead_id = l.id
      LEFT JOIN companies c ON cl.company_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (company_id) {
      params.push(parseInt(company_id));
      query += ` AND cl.company_id = ${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND cl.created_at >= ${params.length}::timestamp`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND cl.created_at <= ${params.length}::timestamp`;
    }
    
    query += ' ORDER BY cl.created_at DESC;';
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No data to export' });
    }
    
    const headers = Object.keys(result.rows[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of result.rows) {
      const values = headers.map(header => {
        const val = row[header];
        if (val === null || val === undefined) return '';
        const stringVal = String(val);
        if (stringVal.includes(',') || stringVal.includes('\n') || stringVal.includes('"')) {
          return `"${stringVal.replace(/"/g, '""')}"`;
        }
        return stringVal;
      });
      csvRows.push(values.join(','));
    }
    
    const csv = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="call_logs_${Date.now()}.csv"`);
    res.send(csv);
    
    logRequest('GET', '/api/call-logs/export/csv', 200);
  } catch (error) {
    logRequest('GET', '/api/call-logs/export/csv', 500);
    handleError(res, error);
  }
};

exports.getActiveCalls = async (req, res) => {
  try {
    const query = `
      SELECT call_sid, lead_id, to_phone, call_type, call_status, created_at
      FROM call_logs
      WHERE call_status IN ('initiated', 'in-progress', 'ringing')
      AND created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC;
    `;
    
    const result = await pool.query(query);
    
    logRequest('GET', '/api/active-calls', 200);
    sendSuccess(res, { count: result.rows.length, calls: result.rows });
  } catch (error) {
    logRequest('GET', '/api/active-calls', 500);
    handleError(res, error);
  }
};

exports.getMetricsDashboard = async (req, res) => {
  try {
    const metrics = {};
    
    const callsResult = await pool.query(`
      SELECT call_type, call_status, COUNT(*) as count, AVG(call_duration) as avg_duration
      FROM call_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY call_type, call_status;
    `);
    metrics.calls_24h = callsResult.rows;
    
    const sentimentResult = await pool.query(`
      SELECT sentiment->>'sentiment' as sentiment_type, COUNT(*) as count
      FROM call_logs
      WHERE sentiment IS NOT NULL
      AND created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY sentiment->>'sentiment';
    `);
    metrics.sentiment_distribution = sentimentResult.rows;
    
    const leadsResult = await pool.query(`
      SELECT lead_status, COUNT(*) as count
      FROM leads
      WHERE updated_at >= NOW() - INTERVAL '24 hours'
      GROUP BY lead_status;
    `);
    metrics.lead_status_24h = leadsResult.rows;
    
    const activeResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM call_logs
      WHERE call_status IN ('initiated', 'in-progress', 'ringing')
      AND created_at >= NOW() - INTERVAL '1 hour';
    `);
    metrics.active_calls = parseInt(activeResult.rows[0].count);
    
    const successResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE call_status = 'completed') as completed,
        COUNT(*) FILTER (WHERE call_status = 'failed') as failed,
        COUNT(*) as total
      FROM call_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours';
    `);
    const success = successResult.rows[0];
    metrics.success_rate = success.total > 0 
      ? ((success.completed / success.total) * 100).toFixed(2) 
      : 0;
    
    logRequest('GET', '/api/metrics/dashboard', 200);
    sendSuccess(res, { data: metrics });
  } catch (error) {
    logRequest('GET', '/api/metrics/dashboard', 500);
    handleError(res, error);
  }
};




exports.getAgentStats = async (req, res) => {
  try {
    const { id } = req.params;
    
    const callStats = await pool.query(`
      SELECT 
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE call_status = 'completed') as completed_calls,
        AVG(call_duration) as avg_duration
      FROM call_logs
      WHERE company_id = (SELECT company_id FROM agent_instances WHERE id = $1)
      AND created_at >= NOW() - INTERVAL '30 days'
    `, [id]);
    
    const messageStats = await pool.query(`
      SELECT COUNT(*) as total_messages
      FROM whatsapp_messages
      WHERE lead_id IN (
        SELECT id FROM leads 
        WHERE company_id = (SELECT company_id FROM agent_instances WHERE id = $1)
      )
      AND timestamp >= NOW() - INTERVAL '30 days'
    `, [id]);
    
    logRequest('GET', `/api/agent-instances/${id}/stats`, 200);
    res.json({ 
      success: true, 
      data: {
        ...callStats.rows[0],
        ...messageStats.rows[0]
      }
    });
    
  } catch (error) {
    logRequest('GET', `/api/agent-instances/${req.params.id}/stats`, 500);
    handleError(res, error);
  }
};

module.exports = exports;