const pool = require('../config/database');
const invoicePayment = require('../services/invoice/invoicePayment');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Get revenue metrics and trends
 */
exports.getRevenueDashboard = async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;

    const result = await invoicePayment.getRevenueDashboard(
      pool, 
      company_id, 
      start_date, 
      end_date
    );

    logRequest('GET', '/api/reports/revenue-dashboard', 200);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Revenue dashboard error:', error);
    logRequest('GET', '/api/reports/revenue-dashboard', 500);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get overdue invoices with aging buckets
 */
exports.getOverdueInvoices = async (req, res) => {
  try {
    const { company_id } = req.query;
    const result = await invoicePayment.getOverdueInvoicesReport(pool, company_id);

    logRequest('GET', '/api/reports/overdue-invoices', 200);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Overdue report error:', error);
    logRequest('GET', '/api/reports/overdue-invoices', 500);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get churn analysis for expired subscriptions
 */
exports.getChurnAnalysis = async (req, res) => {
  try {
    const { company_id, months = 6 } = req.query;
    const result = await invoicePayment.getChurnAnalysis(pool, company_id, months);

    logRequest('GET', '/api/reports/churn-analysis', 200);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Churn analysis error:', error);
    logRequest('GET', '/api/reports/churn-analysis', 500);
    res.status(500).json({ error: error.message });
  }
};