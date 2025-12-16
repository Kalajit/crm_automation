const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');
const chatSummaryService = require('../services/chatSummary/chatSummary.service');

// Summarize WhatsApp conversation
exports.summarizeConversation = async (req, res) => {
  try {
    const { conversation_id, phone_number } = req.body;
    
    let convId = conversation_id;
    
    if (!convId && phone_number) {
      const convResult = await pool.query(
        'SELECT id FROM conversations WHERE phone_number = $1 LIMIT 1',
        [phone_number]
      );
      
      if (convResult.rows.length === 0) {
        return errorResponse(res, 'Conversation not found', 404);
      }
      
      convId = convResult.rows[0].id;
    }
    
    if (!convId) {
      return errorResponse(res, 'conversation_id or phone_number required', 400);
    }
    
    const summary = await chatSummaryService.summarizeWhatsAppConversation(convId);
    
    logger.info('POST', '/api/whatsapp/summarize', 200);
    return successResponse(res, { conversation_id: convId, summary }, 'Conversation summarized successfully');
    
  } catch (error) {
    logger.error('WhatsApp summarize error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Batch summarize conversations
exports.batchSummarizeConversations = async (req, res) => {
  try {
    const { company_id, limit = 50 } = req.body;
    
    if (!company_id) {
      return errorResponse(res, 'company_id required', 400);
    }
    
    const { results, errors } = await chatSummaryService.batchSummarizeConversations(company_id, limit);
    
    logger.info('POST', '/api/whatsapp/batch-summarize', 200);
    return successResponse(res, {
      summarized: results.length,
      failed: errors.length,
      results,
      errors
    }, 'Batch summarization completed');
    
  } catch (error) {
    logger.error('Batch summarize error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get conversation summary by phone
exports.getConversationSummary = async (req, res) => {
  try {
    const { phone } = req.params;
    
    const result = await pool.query(`
      SELECT 
        c.id,
        c.ai_summary,
        c.sentiment,
        c.message_count,
        c.last_message,
        c.updated_at,
        l.name as lead_name
      FROM conversations c
      JOIN leads l ON c.lead_id = l.id
      WHERE c.phone_number = $1
      ORDER BY c.updated_at DESC
      LIMIT 1
    `, [phone]);
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'Conversation not found', 404);
    }
    
    logger.info('GET', `/api/conversations/${phone}/summary`, 200);
    return successResponse(res, result.rows[0], 'Conversation summary retrieved successfully');
    
  } catch (error) {
    logger.error('Get conversation summary error:', error);
    return errorResponse(res, error.message, 500);
  }
};