const express = require('express');
const router = express.Router();
const dripCampaignsController = require('../controllers/dripCampaigns.controller');

// Campaign management
router.post('/', dripCampaignsController.createDripCampaign);
router.get('/:company_id', dripCampaignsController.getDripCampaigns);
router.get('/:company_id/:campaign_id', dripCampaignsController.getCampaignDetails);
router.patch('/:campaign_id', dripCampaignsController.updateDripCampaign);

// Subscriber management
router.post('/subscribe', dripCampaignsController.subscribeToCampaign);
router.post('/unsubscribe', dripCampaignsController.unsubscribeFromCampaign);
router.get('/subscribers/:campaign_id', dripCampaignsController.getCampaignSubscribers);

// Execution and performance
router.get('/executions/:lead_id', dripCampaignsController.getExecutionHistory);
router.get('/:campaign_id/performance', dripCampaignsController.getCampaignPerformance);

module.exports = router;