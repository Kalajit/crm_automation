const pool = require('../config/database');
const { sendSuccess, handleError,errorResponse,successResponse } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Get dashboard metrics
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const stats = {};

    // Total leads
    const leadsResult = await pool.query('SELECT COUNT(*) FROM leads;');
    stats.total_leads = parseInt(leadsResult.rows[0].count);

    // Leads by status
    const statusResult = await pool.query(`
      SELECT lead_status, COUNT(*) as count FROM leads 
      GROUP BY lead_status;
    `);
    stats.leads_by_status = statusResult.rows;

    // Average interest level
    const interestResult = await pool.query(`
      SELECT AVG(interest_level) as avg_interest FROM leads;
    `);
    stats.avg_interest_level = parseFloat(interestResult.rows[0].avg_interest || 0).toFixed(2);

    // Conversations count
    const convResult = await pool.query('SELECT COUNT(*) FROM conversations;');
    stats.total_conversations = parseInt(convResult.rows[0].count);

    // Messages count
    const msgResult = await pool.query('SELECT COUNT(*) FROM whatsapp_messages;');
    stats.total_messages = parseInt(msgResult.rows[0].count);

    // Pending invoices
    const invoiceResult = await pool.query(`
      SELECT COUNT(*) FROM invoices WHERE status = 'pending';
    `);
    stats.pending_invoices = parseInt(invoiceResult.rows[0].count);

    // Pending bookings
    const bookingResult = await pool.query(`
      SELECT COUNT(*) FROM bookings WHERE status = 'pending';
    `);
    stats.pending_bookings = parseInt(bookingResult.rows[0].count);

    logRequest('GET', '/api/stats/dashboard', 200);
    sendSuccess(res, { data: stats });
  } catch (error) {
    logRequest('GET', '/api/stats/dashboard', 500);
    handleError(res, error);
  }
};

/**
 * Get lead metrics
 */
exports.getLeadMetrics = async (req, res) => {
  try {
    const query = `
      SELECT 
        lead_status,
        COUNT(*) as count,
        AVG(interest_level) as avg_interest,
        MAX(updated_at) as last_updated
      FROM leads
      GROUP BY lead_status;
    `;

    const result = await pool.query(query);

    logRequest('GET', '/api/stats/leads', 200);
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/stats/leads', 500);
    handleError(res, error);
  }
};

/**
 * Get message metrics
 */
exports.getMessageMetrics = async (req, res) => {
  try {
    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as message_count,
        COUNT(DISTINCT lead_id) as unique_leads
      FROM whatsapp_messages
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) DESC
      LIMIT 30;
    `;

    const result = await pool.query(query);

    logRequest('GET', '/api/stats/messages', 200);
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/stats/messages', 500);
    handleError(res, error);
  }
};



// Get metrics dashboard
exports.getMetricsDashboard = async (req, res) => {
  try {
    const metrics = {};
    
    const callsResult = await pool.query(`
      SELECT 
        call_type,
        call_status,
        COUNT(*) as count,
        AVG(call_duration) as avg_duration
      FROM call_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY call_type, call_status;
    `);
    metrics.calls_24h = callsResult.rows;
    
    const sentimentResult = await pool.query(`
      SELECT 
        sentiment->>'sentiment' as sentiment_type,
        COUNT(*) as count
      FROM call_logs
      WHERE sentiment IS NOT NULL
      AND created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY sentiment->>'sentiment';
    `);
    metrics.sentiment_distribution = sentimentResult.rows;
    
    const leadsResult = await pool.query(`
      SELECT 
        lead_status,
        COUNT(*) as count
      FROM leads
      WHERE updated_at >= NOW() - INTERVAL '24 hours'
      GROUP BY lead_status;
    `);
    metrics.lead_status_24h = leadsResult.rows;
    
    const activeResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM call_logs
      WHERE call_status IN ('initiated', 'in-progress', 'ringing')
      AND created_at >= NOW() - INTERVAL '1 hour';
    `);
    metrics.active_calls = parseInt(activeResult.rows[0].count);
    
    const successResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE call_status = 'completed') as completed,
        COUNT(*) FILTER (WHERE call_status = 'failed') as failed,
        COUNT(*) as total
      FROM call_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours';
    `);
    const success = successResult.rows[0];
    metrics.success_rate = success.total > 0 
      ? ((success.completed / success.total) * 100).toFixed(2) 
      : 0;
    
    return successResponse(res, metrics, 'Metrics dashboard retrieved successfully');
  } catch (error) {
    console.error('Get metrics dashboard error:', error);
    return errorResponse(res, error.message, 500);
  }
};



// Get active calls
exports.getActiveCalls = async (req, res) => {
  try {
    const query = `
      SELECT 
        call_sid,
        lead_id,
        to_phone,
        call_type,
        call_status,
        created_at
      FROM call_logs
      WHERE call_status IN ('initiated', 'in-progress', 'ringing')
      AND created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC;
    `;
    
    const result = await pool.query(query);
    
    logRequest('GET', '/api/stats/active-calls', 200);
    sendSuccess(res, {
      data: {
        count: result.rows.length,
        calls: result.rows
      },
      message: 'Active calls retrieved successfully'
    });
  } catch (error) {
    console.error('Get active calls error:', error);
    logRequest('GET', '/api/stats/active-calls', 500);
    handleError(res, error);
  }
};