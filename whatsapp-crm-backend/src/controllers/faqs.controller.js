const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Get all active FAQs
 */
exports.getAllFaqs = async (req, res) => {
  try {
    const query = `
      SELECT * FROM faq_templates
      WHERE is_active = TRUE
      ORDER BY priority DESC;
    `;

    const result = await pool.query(query);

    logRequest('GET', '/api/faqs', 200);
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/faqs', 500);
    handleError(res, error);
  }
};

/**
 * Create FAQ
 */
exports.createFaq = async (req, res) => {
  try {
    const { question, answer, category, keywords, priority } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: 'question and answer are required' });
    }

    // Handle keywords as array directly (not JSON string)
    const query = `
      INSERT INTO faq_templates (question, answer, category, keywords, priority)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      question,
      answer,
      category || 'general',
      keywords || null,  // Pass array directly
      priority || 1,
    ]);

    logRequest('POST', '/api/faqs', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/faqs', 500);
    handleError(res, error);
  }
};