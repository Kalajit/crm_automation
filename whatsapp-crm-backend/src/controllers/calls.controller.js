const pool = require('../config/database');
const { broadcastToCall, activeConnections } = require('../websocket/callUpdates');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');
const {logger} = require('../utils/logger');

/**
 * Handle live call update from Python
 */
exports.liveUpdate = async (req, res) => {
  try {
    const {
      call_sid,
      lead_id,
      sentiment,
      summary,
      transcript,
      turn_count,
      call_status,
      call_duration,
      recording_url,
      timestamp
    } = req.body;
    
    if (!call_sid) {
      return res.status(400).json({ error: 'call_sid is required' });
    }
    
    // Fetch lead info to enrich payload
    let leadInfo = null;
    if (lead_id) {
      const leadResult = await pool.query(
        'SELECT name, phone_number, email, chess_rating FROM leads WHERE id = $1', 
        [lead_id]
      );
      leadInfo = leadResult.rows[0] || null;
    }
    
    // Broadcast to all WebSocket clients watching this call
    const payload = {
      type: 'live_update',
      call_sid,
      lead_id,
      lead_info: leadInfo,
      sentiment,
      summary,
      transcript,
      turn_count,
      call_status,
      call_duration,
      recording_url,
      timestamp: timestamp || new Date().toISOString()
    };
    
    broadcastToCall(call_sid, payload);
    
    logger.info('POST', '/api/calls/live-update', 200);
    return sendSuccess(res, {
      message: 'Live update broadcasted successfully',
      broadcast_count: activeConnections.get(call_sid)?.size || 0,
      call_sid
    });

  } catch (error) {
    logger.error('Live update error', error);
    return handleError(res, error, 500);
  }
};




exports.getPendingScheduledCalls = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT sc.*, l.phone_number, l.name, l.company_id
      FROM scheduled_calls sc
      JOIN leads l ON sc.lead_id = l.id
      WHERE sc.status = 'pending' 
        AND sc.scheduled_time <= NOW()
      ORDER BY sc.scheduled_time ASC
    `);
    logger.info('GET', '/api/scheduled-calls/pending', 200);
    return sendSuccess(res, {
      message: 'Pending scheduled calls retrieved',
      data: rows
    });

  } catch (error) {
    logger.error('Get pending scheduled calls error', error);
    return handleError(res, error, 500);
  }
};


// Create call log
exports.createCallLog = async (req, res) => {
  try {
    const { 
      company_id, lead_id, call_sid, to_phone, from_phone, 
      call_type, call_status, transcript, sentiment, summary, 
      conversation_history, recording_url 
    } = req.body;

    // Validate required fields
    if (!call_sid || !to_phone || !from_phone) {
      return handleError(res, { message: 'call_sid, to_phone, and from_phone are required' }, 400);
    }
    
    // Validate lead exists if lead_id is provided
    if (lead_id) {
      const leadCheck = await pool.query('SELECT id FROM leads WHERE id = $1', [lead_id]);
      if (leadCheck.rows.length === 0) {
        return handleError(res, { message: `Lead with id ${lead_id} does not exist` }, 404);
      }
    }
    
    // Validate company exists if company_id is provided
    if (company_id) {
      const companyCheck = await pool.query('SELECT id FROM companies WHERE id = $1', [company_id]);
      if (companyCheck.rows.length === 0) {
        return handleError(res, { message: `Company with id ${company_id} does not exist` }, 404);
      }
    }
    
    const query = `
      INSERT INTO call_logs (
        company_id, lead_id, call_sid, to_phone, from_phone, 
        call_type, call_status, transcript, sentiment, summary, 
        conversation_history, recording_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    
    const result = await pool.query(query, [
      company_id, lead_id, call_sid, to_phone, from_phone, call_type, call_status, 
      transcript, 
      sentiment ? JSON.stringify(sentiment) : null, 
      summary ? JSON.stringify(summary) : null, 
      conversation_history ? JSON.stringify(conversation_history) : null, 
      recording_url
    ]);
    
    logger.info('POST', '/api/call-logs', 201);
    return sendSuccess(res, {
      message: 'Call log created successfully',
      data: result.rows[0]
    }, 201);

  } catch (error) {
    logger.error('Create call log error', error);
    return handleError(res, error, 500);
  }
};

// Update call log
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
    
    const result = await pool.query(query, [
      call_status, call_duration, transcript, 
      sentiment ? JSON.stringify(sentiment) : null, 
      summary ? JSON.stringify(summary) : null, 
      recording_url, call_sid
    ]);
    
    if (result.rows.length === 0) {
      return handleError(res, 'Call log not found', 404);
    }
    
    logger.info('PATCH', `/api/call-logs/${call_sid}`, 200);
    return sendSuccess(res, {
      message: 'Call log updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Update call log error', error);
    return handleError(res, error, 500);
  }
};

// Get call logs by lead
exports.getCallLogsByLead = async (req, res) => {
  try {
    const { lead_id } = req.params;
    // Validate lead exists
    const leadCheck = await pool.query('SELECT id FROM leads WHERE id = $1', [lead_id]);
    if (leadCheck.rows.length === 0) {
      return handleError(res, { message: `Lead with id ${lead_id} does not exist` }, 404);
    }
    const query = `SELECT * FROM call_logs WHERE lead_id = $1 ORDER BY created_at DESC;`;
    const result = await pool.query(query, [lead_id]);
    
    return sendSuccess(res, {
      message: 'Call logs retrieved successfully',
      data: result.rows
    });
  } catch (error) {
    console.error('Get call logs by lead error:', error);
    return handleError(res, error, 500);
  }
};

// Get all call logs with filters
exports.getCallLogs = async (req, res) => {
  try {
    const { company_id, call_type, call_status, limit } = req.query;
    
    let query = 'SELECT * FROM call_logs WHERE 1=1';
    const params = [];
    
    if (company_id) {
      params.push(parseInt(company_id));
      query += ` AND company_id = $${params.length}`;
    }
    
    if (call_type) {
      params.push(call_type);
      query += ` AND call_type = $${params.length}`;
    }
    
    if (call_status) {
      params.push(call_status);
      query += ` AND call_status = $${params.length}`;
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    } else {
      query += ' LIMIT 100';
    }
    
    const result = await pool.query(query, params);
    
    return sendSuccess(res, {
      message: 'Call logs retrieved successfully',
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Get call logs error:', error);
    return handleError(res, error, 500);
  }
};

// Get call log by call_sid
exports.getCallLogByCallSid = async (req, res) => {
  try {
    const { call_sid } = req.params;
    const query = 'SELECT * FROM call_logs WHERE call_sid = $1;';
    const result = await pool.query(query, [call_sid]);
    
    if (result.rows.length === 0) {
      return handleError(res, 'Call log not found', 404);
    }
    
    return sendSuccess(res, {
      message: 'Call log retrieved successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get call log by call_sid error:', error);
    return handleError(res, error, 500);
  }
};

// Export call logs to CSV
exports.exportCallLogsToCSV = async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    let query = `
      SELECT 
        cl.call_sid,
        cl.to_phone,
        cl.from_phone,
        cl.call_type,
        cl.call_status,
        cl.call_duration,
        cl.created_at,
        cl.sentiment->>'sentiment' as sentiment,
        cl.sentiment->>'tone_score' as tone_score,
        cl.summary->>'intent' as intent,
        cl.summary->>'summary' as summary_text,
        l.name as lead_name,
        l.email as lead_email,
        c.name as company_name
      FROM call_logs cl
      LEFT JOIN leads l ON cl.lead_id = l.id
      LEFT JOIN companies c ON cl.company_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (company_id) {
      params.push(parseInt(company_id));
      query += ` AND cl.company_id = $${params.length}`;
    }
    
    if (start_date) {
      params.push(start_date);
      query += ` AND cl.created_at >= $${params.length}::timestamp`;
    }
    
    if (end_date) {
      params.push(end_date);
      query += ` AND cl.created_at <= $${params.length}::timestamp`;
    }
    
    query += ' ORDER BY cl.created_at DESC;';
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return handleError(res, 'No data to export', 404);
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
  } catch (error) {
    console.error('Export call logs error:', error);
    return handleError(res, error.message, 500);
  }
};


// Get active calls
exports.getActiveCalls = async (req, res) => {
  try {
    const query = `
      SELECT 
        call_sid,
        lead_id,
        to_phone,
        call_type,
        call_status,
        created_at
      FROM call_logs
      WHERE call_status IN ('initiated', 'in-progress', 'ringing')
      AND created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC;
    `;
    
    const result = await pool.query(query);
    
    logger.info('GET', '/api/active-calls', 200);
    
    // FIXED: Proper parameter order for sendSuccess
    return sendSuccess(res, {
      message: 'Active calls retrieved successfully',
      count: result.rows.length,
      calls: result.rows
    });

  } catch (error) {
    logger.error('Get active calls error', error);
    return handleError(res, error, 500);
  }
};