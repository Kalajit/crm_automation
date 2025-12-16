const cron = require('node-cron');
const logger = require('../utils/logger');
const emailScanner = require('./emailScanner');
const dripCampaignExecutor = require('./dripCampaignExecutor');
const smsScheduler = require('./smsScheduler');
const dailyReset = require('./dailyReset');

/**
 * Initialize all scheduled jobs
 */
function initializeSchedulers() {
  logger.info('Initializing scheduler jobs...');

  // Email Scanner - Every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    logger.info('[CRON] Running email scanner...');
    try {
      await emailScanner.scanAllCompanies();
      logger.info('[CRON] Email scanner completed');
    } catch (error) {
      logger.error('[CRON] Email scanner failed:', error);
    }
  });

  // Drip Campaign Executor - Every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    logger.info('[CRON] Running drip campaign executor...');
    try {
      await dripCampaignExecutor.processPendingExecutions();
      logger.info('[CRON] Drip campaign executor completed');
    } catch (error) {
      logger.error('[CRON] Drip campaign executor failed:', error);
    }
  });

  // SMS Campaign Executor - Every 1 minute
  cron.schedule('* * * * *', async () => {
    logger.info('[CRON] Running SMS scheduler...');
    try {
      await smsScheduler.processPendingCampaigns();
      logger.info('[CRON] SMS scheduler completed');
    } catch (error) {
      logger.error('[CRON] SMS scheduler failed:', error);
    }
  });

  // Daily Reset - Every midnight
  cron.schedule('0 0 * * *', async () => {
    logger.info('[CRON] Running daily reset...');
    try {
      await dailyReset.resetDailyLimits();
      logger.info('[CRON] Daily reset completed');
    } catch (error) {
      logger.error('[CRON] Daily reset failed:', error);
    }
  });

  logger.info('All scheduler jobs initialized successfully');
}

module.exports = { initializeSchedulers };