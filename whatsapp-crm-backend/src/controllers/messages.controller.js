const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Store incoming WhatsApp message
 */
exports.storeMessage = async (req, res) => {
  try {
    const { conversation_id, lead_id, phone_number, message_type, message_body, message_id, sender } = req.body;

    if (!conversation_id || !lead_id || !message_body) {
      return res.status(400).json({ error: 'conversation_id, lead_id, and message_body are required' });
    }

    const query = `
      INSERT INTO whatsapp_messages 
      (conversation_id, lead_id, phone_number, message_type, message_body, sender, message_id, is_from_user)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      conversation_id,
      lead_id,
      phone_number,
      message_type || 'text',
      message_body,
      sender || 'user',
      message_id || null,
      sender === 'user' ? true : false,
    ]);

    // Update conversation's last message
    await pool.query(
      `UPDATE conversations 
       SET last_message = $1, last_message_timestamp = CURRENT_TIMESTAMP, message_count = message_count + 1
       WHERE id = $2;`,
      [message_body, conversation_id]
    );

    logRequest('POST', '/api/messages', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/messages', 500);
    handleError(res, error);
  }
};

/**
 * Get messages for a conversation
 */
exports.getMessagesByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const limit = req.query.limit || 50;

    const query = `
      SELECT * FROM whatsapp_messages
      WHERE phone_number = $1
      ORDER BY timestamp DESC
      LIMIT $2;
    `;

    const result = await pool.query(query, [phone, limit]);

    logRequest('GET', `/api/messages/${phone}`, 200);
    sendSuccess(res, { data: result.rows.reverse() });
  } catch (error) {
    logRequest('GET', `/api/messages/${phone}`, 500);
    handleError(res, error);
  }
};