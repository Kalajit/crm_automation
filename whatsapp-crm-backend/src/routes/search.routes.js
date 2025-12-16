const express = require('express');
const router = express.Router();
const searchController = require('../controllers/search.controller');

// Search call transcripts
router.get('/transcripts', searchController.searchTranscripts);

// Search WhatsApp messages
router.get('/whatsapp', searchController.searchWhatsApp);

// Combined search
router.get('/combined', searchController.searchCombined);

module.exports = router;