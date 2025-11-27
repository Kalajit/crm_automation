const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Get dashboard overview with key metrics
 */
exports.getDashboardOverview = async (req, res) => {
  try {
    const overview = {};
    const today = new Date().toISOString().split('T')[0];

    // Calls today
    const callsToday = await pool.query(`
      SELECT COUNT(*) as total, call_status
      FROM call_logs
      WHERE DATE(created_at) = $1
      GROUP BY call_status;
    `, [today]);
    overview.calls_today = callsToday.rows;

    // Hot leads (high interest)
    const hotLeads = await pool.query(`
      SELECT COUNT(*) as count
      FROM leads
      WHERE lead_status = 'qualified'
      AND updated_at >= NOW() - INTERVAL '24 hours';
    `);
    overview.hot_leads_24h = parseInt(hotLeads.rows[0].count);

    // Failed calls today
    const failedCalls = await pool.query(`
      SELECT COUNT(*) as count
      FROM call_logs
      WHERE call_status = 'failed'
      AND DATE(created_at) = $1;
    `, [today]);
    overview.failed_calls_today = parseInt(failedCalls.rows[0].count);

    // Active calls right now
    const activeCalls = await pool.query(`
      SELECT COUNT(*) as count
      FROM call_logs
      WHERE call_status IN ('initiated', 'in-progress', 'ringing')
      AND created_at >= NOW() - INTERVAL '1 hour';
    `);
    overview.active_calls = parseInt(activeCalls.rows[0].count);

    // Pending scheduled calls
    const pendingCalls = await pool.query(`
      SELECT COUNT(*) as count
      FROM scheduled_calls
      WHERE status = 'pending'
      AND scheduled_time <= NOW() + INTERVAL '24 hours';
    `);
    overview.pending_calls_24h = parseInt(pendingCalls.rows[0].count);

    logRequest('GET', '/api/dashboard/overview', 200);
    sendSuccess(res, { data: overview });
  } catch (error) {
    logRequest('GET', '/api/dashboard/overview', 500);
    handleError(res, error);
  }
};