const pool = require('../config/database');
const { broadcastToCall, activeConnections } = require('../websocket/callUpdates');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

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
    
    logRequest('POST', '/api/calls/live-update', 200);
    sendSuccess(res, { 
      message: `Broadcast to ${activeConnections.get(call_sid)?.size || 0} clients`,
      call_sid 
    });
    
  } catch (error) {
    logRequest('POST', '/api/calls/live-update', 500);
    handleError(res, error);
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
    logRequest('GET', '/api/scheduled-calls/pending', 200);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (e) {
    logRequest('GET', '/api/scheduled-calls/pending', 500);
    handleError(res, e);
  }
};