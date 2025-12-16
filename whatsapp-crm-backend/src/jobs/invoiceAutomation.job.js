const cron = require('node-cron');
const pool = require('../config/database');
const invoicePayment = require('../services/invoice/invoicePayment.service');
const {logger} = require('../utils/logger');

// Initialize invoice automation jobs
exports.initializeInvoiceJobs = () => {
  if (process.env.NODE_ENV !== 'production') {
    logger.info('⚠️  Invoice automation jobs disabled (not in production)');
    return;
  }

  // Check renewals daily at 9 AM
  cron.schedule('0 9 * * *', async () => {
    logger.info('🔄 Running daily renewal check...');
    try {
      await invoicePayment.checkRenewals(pool);
    } catch (error) {
      logger.error('Renewal check cron error:', error);
    }
  });

  // Handle overdue invoices daily at 10 AM
  cron.schedule('0 10 * * *', async () => {
    logger.info('🔄 Running overdue invoice check...');
    try {
      await invoicePayment.handleOverdueInvoices(pool);
    } catch (error) {
      logger.error('Overdue invoice cron error:', error);
    }
  });

  logger.info('✅ Invoice & Payment automation jobs initialized');
};