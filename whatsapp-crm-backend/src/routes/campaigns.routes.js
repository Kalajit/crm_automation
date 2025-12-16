const express = require('express');
const router = express.Router();
const campaignsController = require('../controllers/campaigns.controller');

// Create campaign
router.post('/', campaignsController.createCampaign);

// Get campaign stats
router.get('/:id/stats', campaignsController.getCampaignStats);

router.post('/whatsapp/send-bulk', campaignsController.sendBulkWhatsApp);
router.get('/whatsapp/bulk-job/:jobId', campaignsController.getBulkJobStatus);
router.get('/whatsapp/rate-limit-stats/:companyId', campaignsController.getRateLimitStats);

module.exports = router;