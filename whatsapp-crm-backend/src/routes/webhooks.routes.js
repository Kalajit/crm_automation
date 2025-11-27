const express = require('express');
const router = express.Router();
const webhooksController = require('../controllers/webhooks.controller');

// n8n webhook
router.post('/n8n', webhooksController.handleN8nWebhook);

// Call completed webhook
router.post('/call-completed', webhooksController.handleCallCompleted);

// Call failed webhook
router.post('/call-failed', webhooksController.handleCallFailed);

module.exports = router;