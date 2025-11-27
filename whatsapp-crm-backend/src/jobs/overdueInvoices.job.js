const pool = require('../config/database');
const invoicePayment = require('../services/invoice/invoicePayment');
const { logInfo, logError } = require('../utils/logger');

/**
 * Background job to handle overdue invoices
 * Should be run daily via cron or task scheduler
 */
async function handleOverdueInvoicesJob() {
  try {
    logInfo('Starting overdue invoices job...');
    
    const result = await invoicePayment.handleOverdueInvoices(pool);
    
    logInfo('Overdue invoices job completed', {
      overdue_count: result.overdue_count,
      actions_taken: result.actions_taken
    });
    
    return result;
  } catch (error) {
    logError('Overdue invoices job failed', error);
    throw error;
  }
}

/**
 * Background job to check subscription renewals
 * Should be run daily via cron or task scheduler
 */
async function checkSubscriptionRenewalsJob() {
  try {
    logInfo('Starting subscription renewals check...');
    
    const result = await invoicePayment.checkRenewals(pool);
    
    logInfo('Subscription renewals check completed', {
      reminders_sent: result.reminders_sent,
      expired_subscriptions: result.expired_subscriptions
    });
    
    return result;
  } catch (error) {
    logError('Subscription renewals job failed', error);
    throw error;
  }
}

// Export job functions
module.exports = {
  handleOverdueInvoicesJob,
  checkSubscriptionRenewalsJob
};

// If running directly (not as module)
if (require.main === module) {
  (async () => {
    try {
      await handleOverdueInvoicesJob();
      await checkSubscriptionRenewalsJob();
      process.exit(0);
    } catch (error) {
      console.error('Job execution failed:', error);
      process.exit(1);
    }
  })();
}