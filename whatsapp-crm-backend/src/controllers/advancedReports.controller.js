const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');
const reportsService = require('../services/reports/reports.service');

// Get agent performance report
exports.getAgentPerformance = async (req, res) => {
  try {
    const { company_id, start_date, end_date, agent_id } = req.query;

    // Verify company access
    if (req.user.role !== 'admin' && req.user.company_id !== parseInt(company_id)) {
      return errorResponse(res, 'Access denied to this company', 403);
    }
    
    const result = await reportsService.getAgentPerformanceReport({
      company_id,
      start_date,
      end_date,
      agent_id
    });
    
    logger.info('GET', '/api/reports/agent-performance', 200);
    return successResponse(res, result, 'Agent performance report retrieved successfully');
    
  } catch (error) {
    logger.error('Agent performance report error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get revenue forecast
exports.getRevenueForecast = async (req, res) => {
  try {
    const { company_id, months = 3 } = req.query;
    
    if (!company_id) {
      return errorResponse(res, 'company_id is required', 400);
    }

    // Verify company access
    if (req.user.role !== 'admin' && req.user.company_id !== parseInt(company_id)) {
      return errorResponse(res, 'Access denied to this company', 403);
    }
    
    const result = await reportsService.getRevenueForecast(company_id, months);
    
    logger.info('GET', '/api/reports/revenue-forecast', 200);
    return successResponse(res, result, 'Revenue forecast retrieved successfully');
    
  } catch (error) {
    logger.error('Revenue forecast error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get churn prediction
exports.getChurnPrediction = async (req, res) => {
  try {
    const { company_id } = req.query;
    
    if (!company_id) {
      return errorResponse(res, 'company_id is required', 400);
    }
    
    const result = await reportsService.getChurnPrediction(company_id);
    
    logger.info('GET', '/api/reports/churn-prediction', 200);
    return successResponse(res, result, 'Churn prediction retrieved successfully');
    
  } catch (error) {
    logger.error('Churn prediction error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get campaign ROI
exports.getCampaignROI = async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    if (!company_id) {
      return errorResponse(res, 'company_id is required', 400);
    }
    
    const result = await reportsService.getCampaignROI({
      company_id,
      start_date,
      end_date
    });
    
    logger.info('GET', '/api/reports/campaign-roi', 200);
    return successResponse(res, result, 'Campaign ROI analysis retrieved successfully');
    
  } catch (error) {
    logger.error('Campaign ROI analysis error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Schedule report
exports.scheduleReport = async (req, res) => {
  try {
    const {
      company_id,
      report_type,
      frequency,
      recipients,
      format = 'pdf',
      delivery_time = '09:00'
    } = req.body;
    
    if (!company_id || !report_type || !frequency || !recipients) {
      return errorResponse(res, 'company_id, report_type, frequency, and recipients are required', 400);
    }
    
    let next_delivery;
    const deliveryTimeStr = delivery_time;
    
    switch(frequency) {
      case 'daily':
        next_delivery = `(CURRENT_DATE + 1) + '${deliveryTimeStr}'::time`;
        break;
      case 'weekly':
        next_delivery = `(CURRENT_DATE + 7) + '${deliveryTimeStr}'::time`;
        break;
      case 'monthly':
        next_delivery = `(CURRENT_DATE + 30) + '${deliveryTimeStr}'::time`;
        break;
      default:
        next_delivery = `(CURRENT_DATE + 1) + '${deliveryTimeStr}'::time`;
    }
    
    const result = await pool.query(`
      INSERT INTO scheduled_reports (
        company_id, report_type, frequency,
        recipients, format, delivery_time,
        is_active, next_delivery
      )
      VALUES ($1, $2, $3, $4, $5, $6, TRUE, ${next_delivery})
      RETURNING *
    `, [
      company_id,
      report_type,
      frequency,
      JSON.stringify(recipients),
      format,
      deliveryTimeStr
    ]);
    
    logger.info('POST', '/api/reports/schedule', 201);
    return successResponse(res, result.rows[0], 'Report scheduled successfully', 201);
    
  } catch (error) {
    logger.error('Schedule report error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get scheduled reports
exports.getScheduledReports = async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM scheduled_reports
      WHERE company_id = $1
      ORDER BY created_at DESC
    `, [company_id]);
    
    logger.info('GET', `/api/reports/scheduled/${company_id}`, 200);
    return successResponse(res, result.rows, 'Scheduled reports retrieved successfully');
    
  } catch (error) {
    logger.error('Get scheduled reports error:', error);
    return errorResponse(res, error.message, 500);
  }
};