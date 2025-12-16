const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');
const searchService = require('../services/search/search.service');

// Search call transcripts
exports.searchTranscripts = async (req, res) => {
  try {
    const { 
      query, 
      company_id, 
      start_date, 
      end_date,
      sentiment,
      limit = 50 
    } = req.query;
    
    const results = await searchService.searchTranscripts({
      query,
      company_id,
      start_date,
      end_date,
      sentiment,
      limit
    });
    
    logger.info('GET', '/api/transcripts/search', 200);
    return successResponse(res, {
      query,
      count: results.length,
      results
    }, 'Transcript search completed successfully');
    
  } catch (error) {
    logger.error('Transcript search error:', error);
    return errorResponse(res, error.message, error.message.includes('3 characters') ? 400 : 500);
  }
};

// Search WhatsApp messages
exports.searchWhatsApp = async (req, res) => {
  try {
    const { 
      query, 
      company_id, 
      start_date, 
      end_date,
      limit = 50 
    } = req.query;
    
    const results = await searchService.searchWhatsAppMessages({
      query,
      company_id,
      start_date,
      end_date,
      limit
    });
    
    logger.info('GET', '/api/whatsapp/search', 200);
    return successResponse(res, {
      query,
      count: results.length,
      results
    }, 'WhatsApp search completed successfully');
    
  } catch (error) {
    logger.error('WhatsApp search error:', error);
    return errorResponse(res, error.message, error.message.includes('3 characters') ? 400 : 500);
  }
};

// Combined search
exports.searchCombined = async (req, res) => {
  try {
    const { query, company_id, limit = 20 } = req.query;
    
    const results = await searchService.searchCombined({
      query,
      company_id,
      limit
    });
    
    logger.info('GET', '/api/search/combined', 200);
    return successResponse(res, { query, results }, 'Combined search completed successfully');
    
  } catch (error) {
    logger.error('Combined search error:', error);
    return errorResponse(res, error.message, error.message.includes('3 characters') ? 400 : 500);
  }
};