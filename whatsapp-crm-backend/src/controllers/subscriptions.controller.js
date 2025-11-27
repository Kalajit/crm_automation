const pool = require('../config/database');
const invoicePayment = require('../services/invoice/invoicePayment');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Check expiring subscriptions and send reminders
 */
exports.checkRenewals = async (req, res) => {
  try {
    const result = await invoicePayment.checkRenewals(pool);
    
    logRequest('POST', '/api/subscriptions/check-renewals', 200);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Check renewals error:', error);
    logRequest('POST', '/api/subscriptions/check-renewals', 500);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get all active subscriptions
 */
exports.getActiveSubscriptions = async (req, res) => {
  try {
    const { company_id } = req.query;
    const result = await invoicePayment.getActiveSubscriptions(pool, company_id);

    logRequest('GET', '/api/subscriptions/active', 200);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Active subscriptions error:', error);
    logRequest('GET', '/api/subscriptions/active', 500);
    res.status(500).json({ error: error.message });
  }
};