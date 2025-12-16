const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Create system notification
 */
exports.createSystemNotification = async (req, res) => {
  try {
    const { notification_type, title, message, priority, metadata } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'title and message are required' });
    }

    const query = `
      INSERT INTO system_notifications (notification_type, title, message, priority, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      notification_type || 'info',
      title,
      message,
      priority || 'normal',
      metadata ? JSON.stringify(metadata) : null
    ]);

    logRequest('POST', '/api/system-notifications', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/system-notifications', 500);
    handleError(res, error);
  }
};

/**
 * Get system notifications
 */
exports.getSystemNotifications = async (req, res) => {
  try {
    const { type, priority, limit } = req.query;

    let query = 'SELECT * FROM system_notifications WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (type) {
      paramCount++;
      query += ` AND notification_type = $${paramCount}`;
      params.push(type);
    }

    if (priority) {
      paramCount++;
      query += ` AND priority = $${paramCount}`;
      params.push(priority);
    }

    query += ' ORDER BY created_at DESC';

    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    } else {
      query += ' LIMIT 100';
    }

    const result = await pool.query(query, params);

    logRequest('GET', '/api/system-notifications', 200);
    sendSuccess(res, { count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/system-notifications', 500);
    handleError(res, error);
  }
};

/**
 * Mark notification as read
 */
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      UPDATE system_notifications
      SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    logRequest('PATCH', `/api/system-notifications/${id}/read`, 200);
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/system-notifications/${id}/read`, 500);
    handleError(res, error);
  }
};

/**
 * Create alert
 */
exports.createAlert = async (req, res) => {
  try {
    const { alert_type, title, message, severity, lead_id, metadata } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'title and message are required' });
    }

    const query = `
      INSERT INTO alerts (alert_type, title, message, severity, lead_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      alert_type || 'info',
      title,
      message,
      severity || 'normal',
      lead_id || null,
      metadata ? JSON.stringify(metadata) : null
    ]);

    // Also create a system notification for UI
    await pool.query(`
      INSERT INTO system_notifications (notification_type, title, message, priority, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `, [alert_type, title, message, severity, metadata ? JSON.stringify(metadata) : null]);

    logRequest('POST', '/api/alerts', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/alerts', 500);
    handleError(res, error);
  }
};

/**
 * Get alerts
 */
exports.getAlerts = async (req, res) => {
  try {
    const { severity, alert_type, limit } = req.query;

    let query = 'SELECT * FROM alerts WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (severity) {
      paramCount++;
      query += ` AND severity = $${paramCount}`;
      params.push(severity);
    }

    if (alert_type) {
      paramCount++;
      query += ` AND alert_type = $${paramCount}`;
      params.push(alert_type);
    }

    query += ' ORDER BY created_at DESC';

    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    } else {
      query += ' LIMIT 50';
    }

    const result = await pool.query(query, params);

    logRequest('GET', '/api/alerts', 200);
    sendSuccess(res, { count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/alerts', 500);
    handleError(res, error);
  }
};

/**
 * Queue email
 */
exports.queueEmail = async (req, res) => {
  try {
    const { to_email, subject, body, lead_id, priority } = req.body;

    if (!to_email || !subject || !body) {
      return res.status(400).json({ error: 'to_email, subject, and body are required' });
    }

    const query = `
      INSERT INTO email_queue (to_email, subject, body, lead_id, priority, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING *;
    `;

    const result = await pool.query(query, [
      to_email,
      subject,
      body,
      lead_id || null,
      priority || 'normal'
    ]);

    logRequest('POST', '/api/email-queue', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/email-queue', 500);
    handleError(res, error);
  }
};

/**
 * Get pending emails
 */
exports.getPendingEmails = async (req, res) => {
  try {
    const query = `
      SELECT * FROM email_queue
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT 50;
    `;

    const result = await pool.query(query);

    logRequest('GET', '/api/email-queue/pending', 200);
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/email-queue/pending', 500);
    handleError(res, error);
  }
};

/**
 * Create audit log
 */
exports.createAuditLog = async (req, res) => {
  try {
    const { lead_id, action, details, created_by } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }

    const query = `
      INSERT INTO audit_logs (lead_id, action, details, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      lead_id,
      action,
      details ? JSON.stringify(details) : null,
      created_by || 'system',
    ]);

    logRequest('POST', '/api/audit-log', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/audit-log', 500);
    handleError(res, error);
  }
};

/**
 * Get recording
 */
exports.getRecording = async (req, res) => {
  try {
    const { call_sid } = req.params;

    const query = `
      SELECT recording_url, local_audio_path, call_duration, created_at
      FROM call_logs
      WHERE call_sid = $1;
    `;

    const result = await pool.query(query, [call_sid]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recording not found' });
    }

    logRequest('GET', `/api/recordings/${call_sid}`, 200);
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/recordings/${call_sid}`, 500);
    handleError(res, error);
  }
};

module.exports = exports;