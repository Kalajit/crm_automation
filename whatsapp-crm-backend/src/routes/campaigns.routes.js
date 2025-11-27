const express = require('express');
const router = express.Router();
const campaignsController = require('../controllers/campaigns.controller');

// Create campaign
router.post('/', campaignsController.createCampaign);

// Get campaign stats
router.get('/:id/stats', campaignsController.getCampaignStats);

module.exports = router;