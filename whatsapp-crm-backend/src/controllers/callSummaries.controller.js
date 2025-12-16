const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');
const callSummaryService = require('../services/callSummary/callSummary.service');

// Send call summary to customer
exports.sendCallSummary = async (req, res) => {
  try {
    const { call_sid, channels } = req.body;
    
    if (!call_sid) {
      return errorResponse(res, 'call_sid required', 400);
    }
    
    const results = {};
    
    if (!channels || channels.includes('email')) {
      results.email = await callSummaryService.sendCallSummaryEmail(call_sid);
    }
    
    if (!channels || channels.includes('whatsapp')) {
      results.whatsapp = await callSummaryService.sendCallSummaryWhatsApp(call_sid);
    }
    
    logger.info('POST', '/api/call-summaries/send', 200);
    return successResponse(res, { call_sid, results }, 'Call summary sent successfully');
    
  } catch (error) {
    logger.error('Send call summary error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get call summary
exports.getCallSummary = async (req, res) => {
  try {
    const { call_sid } = req.params;
    
    const result = await pool.query(`
      SELECT 
        cl.call_sid,
        cl.call_duration,
        cl.transcript,
        cl.sentiment,
        cl.summary,
        l.name as lead_name,
        l.email,
        l.phone_number
      FROM call_logs cl
      JOIN leads l ON cl.lead_id = l.id
      WHERE cl.call_sid = $1
    `, [call_sid]);
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'Call not found', 404);
    }
    
    logger.info('GET', `/api/call-summaries/${call_sid}`, 200);
    return successResponse(res, result.rows[0], 'Call summary retrieved successfully');
    
  } catch (error) {
    logger.error('Get call summary error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Regenerate call summary
exports.regenerateCallSummary = async (req, res) => {
  try {
    const { call_sid } = req.body;
    
    if (!call_sid) {
      return errorResponse(res, 'call_sid required', 400);
    }
    
    const summaryData = await callSummaryService.generateCustomerSummary(call_sid);
    
    logger.info('POST', '/api/call-summaries/regenerate', 200);
    return successResponse(res, summaryData, 'Call summary regenerated successfully');
    
  } catch (error) {
    logger.error('Regenerate summary error:', error);
    return errorResponse(res, error.message, 500);
  }
};