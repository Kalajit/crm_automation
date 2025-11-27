const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsapp.controller');

// OAuth flow
router.get('/oauth/start', whatsappController.startOAuth);
router.get('/oauth/callback', whatsappController.handleOAuthCallback);
router.get('/oauth/status/:agent_instance_id', whatsappController.getOAuthStatus);
router.delete('/oauth/disconnect/:agent_instance_id', whatsappController.disconnectWhatsApp);

// Webhook handling
router.post('/webhook', whatsappController.handleWebhook);
router.get('/webhook', whatsappController.verifyWebhook);

// Legacy webhook endpoint (backward compatibility)
router.post('/webhooks/whatsapp-universal', whatsappController.handleWebhook);
router.get('/webhooks/whatsapp-universal', whatsappController.verifyWebhook);

// Send message
router.post('/send', whatsappController.sendMessage);

// Save credentials (manual setup)
router.post('/credentials/:agent_instance_id', whatsappController.saveCredentials);

module.exports = router;