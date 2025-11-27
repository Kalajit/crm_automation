const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Create notification
 */
exports.createNotification = async (req, res) => {
  try {
    const { lead_id, phone_number, notification_type, title, message, scheduled_time, delivery_channel } = req.body;

    if (!lead_id || !title || !message) {
      return res.status(400).json({ error: 'lead_id, title, and message are required' });
    }

    const query = `
      INSERT INTO notifications 
      (lead_id, phone_number, notification_type, title, message, scheduled_time, delivery_channel)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      lead_id,
      phone_number,
      notification_type,
      title,
      message,
      scheduled_time,
      delivery_channel || 'whatsapp',
    ]);

    logRequest('POST', '/api/notifications', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/notifications', 500);
    handleError(res, error);
  }
};

/**
 * Get pending notifications by phone
 */
exports.getPendingNotificationsByPhone = async (req, res) => {
  try {
    const { phone } = req.params;

    const query = `
      SELECT * FROM notifications
      WHERE phone_number = $1 AND status = 'pending'
      ORDER BY scheduled_time ASC;
    `;

    const result = await pool.query(query, [phone]);

    logRequest('GET', `/api/notifications/pending/${phone}`, 200);
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/notifications/pending/${phone}`, 500);
    handleError(res, error);
  }
};

/**
 * Get all pending notifications
 */
exports.getAllPendingNotifications = async (req, res) => {
  try {
    const now = new Date();
    
    const query = `
      SELECT n.*, l.name, l.phone_number 
      FROM notifications n
      JOIN leads l ON n.lead_id = l.id
      WHERE n.status = 'pending'
      AND n.scheduled_time <= $1
      ORDER BY n.scheduled_time ASC;
    `;

    const result = await pool.query(query, [now]);

    sendSuccess(res, { data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Mark notification as sent
 */
exports.markNotificationSent = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, sent_at } = req.body;

    const query = `
      UPDATE notifications
      SET status = $1, sent_at = $2
      WHERE id = $3
      RETURNING *;
    `;

    const result = await pool.query(query, [status, sent_at, id]);

    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};