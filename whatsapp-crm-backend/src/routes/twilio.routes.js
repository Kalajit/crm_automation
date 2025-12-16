const express = require('express');
const router = express.Router();
const twilioController = require('../controllers/twilio.controller');

router.get('/oauth/start', twilioController.startOAuth);
router.get('/oauth/callback', twilioController.handleOAuthCallback);
router.get('/oauth/status/:agent_instance_id', twilioController.getOAuthStatus);
router.delete('/oauth/disconnect/:agent_instance_id', twilioController.disconnectOAuth);
router.post('/voice-webhook', twilioController.handleVoiceWebhook);

module.exports = router;