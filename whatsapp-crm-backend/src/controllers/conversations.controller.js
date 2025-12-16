const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');
const { normalizePhoneNumber } = require('../utils/helpers');

/**
 * Get or create conversation
 */
exports.getOrCreateConversation = async (req, res) => {
  try {
    const { lead_id, phone_number } = req.body;

    if (!lead_id || !phone_number) {
      return res.status(400).json({ error: 'lead_id and phone_number are required' });
    }

    let query = `SELECT * FROM conversations WHERE lead_id = $1 AND phone_number = $2;`;
    let result = await pool.query(query, [lead_id, phone_number]);

    if (result.rows.length === 0) {
      const createQuery = `
        INSERT INTO conversations (lead_id, phone_number, conversation_history)
        VALUES ($1, $2, '')
        RETURNING *;
      `;
      result = await pool.query(createQuery, [lead_id, phone_number]);
      logRequest('POST', '/api/conversations', 201);
    } else {
      logRequest('POST', '/api/conversations', 200);
    }

    res.status(result.rows.length > 0 ? 200 : 201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logRequest('POST', '/api/conversations', 500);
    handleError(res, error);
  }
};

/**
 * Get conversation history by phone
 */
exports.getConversationByPhone = async (req, res) => {
  try {
    let { phone } = req.params;
    
    // Normalize phone number
    phone = normalizePhoneNumber(phone);

    const query = `
      SELECT 
        c.*,
        l.name,
        l.email,
        l.lead_status,
        l.chess_rating,
        l.location
      FROM conversations c
      JOIN leads l ON c.lead_id = l.id
      WHERE c.phone_number = $1
      ORDER BY c.updated_at DESC
      LIMIT 1;
    `;

    const result = await pool.query(query, [phone]);

    if (result.rows.length === 0) {
      logRequest('GET', `/api/conversations/${phone}`, 200);
      return res.json({ 
        success: false, 
        data: {
          conversation_history: '',
          message_count: 0
        },
        message: 'Conversation not found' 
      });
    }

    logRequest('GET', `/api/conversations/${phone}`, 200);
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/conversations/${phone}`, 500);
    handleError(res, error);
  }
};



exports.getConversationMessages = async (req, res) => {
  try {
    const { phone } = req.params;
    const { limit } = req.query;
    
    const query = `
      SELECT 
        wm.*,
        l.name as lead_name
      FROM whatsapp_messages wm
      LEFT JOIN leads l ON wm.lead_id = l.id
      WHERE wm.phone_number = $1
      ORDER BY wm.timestamp DESC
      LIMIT $2
    `;
    
    const result = await pool.query(query, [phone, parseInt(limit) || 100]);
    
    logRequest('GET', `/api/conversations/${phone}/messages`, 200);
    res.json({ success: true, data: result.rows });
    
  } catch (error) {
    logRequest('GET', `/api/conversations/${req.params.phone}/messages`, 500);
    handleError(res, error);
  }
};