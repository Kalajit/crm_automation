const dripCampaignService = require('../services/dripCampaign/dripCampaign.service');

exports.processPendingExecutions = async () => {
  try {
    logger.info('Processing pending drip campaign executions...');
    
    const result = await dripCampaignService.processPendingExecutions();
    
    logger.info(`Processed ${result.processed} drip campaign executions`);
    return result;
  } catch (error) {
    logger.error('Process pending drip executions error:', error);
    throw error;
  }
};