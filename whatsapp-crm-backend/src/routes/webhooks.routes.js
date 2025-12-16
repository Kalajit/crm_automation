const express = require('express');
const router = express.Router();
const webhooksController = require('../controllers/webhooks.controller');

// n8n webhook
router.post('/n8n', webhooksController.handleN8nWebhook);

// Call completed webhook
router.post('/call-completed', webhooksController.handleCallCompleted);

// Call failed webhook
router.post('/call-failed', webhooksController.handleCallFailed);

// New route for Part 8
router.post('/lead-capture', webhooksController.handleLeadCapture);

// NEW: Unified webhook for all platforms
router.post('/lead-capture/:token', webhooksController.handleUnifiedLeadCapture);

// NEW: Meta-specific webhook
router.post('/meta-leads/:token', webhooksController.handleMetaLeadsWebhook);

module.exports = router;