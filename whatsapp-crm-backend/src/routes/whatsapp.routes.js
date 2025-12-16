const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsapp.controller');
const chatSummariesController = require('../controllers/chatSummaries.controller');

// OAuth flow
router.get('/oauth/start', whatsappController.startOAuth);
router.get('/oauth/callback', whatsappController.oauthCallback);
router.get('/oauth/status/:agent_instance_id', whatsappController.getOAuthStatus);
router.delete('/oauth/disconnect/:agent_instance_id', whatsappController.disconnectWhatsApp);

// Webhook handling
router.post('/webhook', whatsappController.handleWebhook);
router.get('/webhook', whatsappController.verifyWebhook);

// Save credentials manually
router.post('/agent-instances/:id/credentials', whatsappController.saveCredentials);

// Legacy webhook endpoint (backward compatibility)
router.post('/webhooks/whatsapp-universal', whatsappController.handleWebhook);
router.get('/webhooks/whatsapp-universal', whatsappController.verifyWebhook);

// Send message
router.post('/send', whatsappController.sendMessage);

// Save credentials (manual setup)
router.post('/credentials/:agent_instance_id', whatsappController.saveCredentials);

// route for Part 8
router.post('/send-manual', whatsappController.sendManualMessage);

// WhatsApp scheduling and invoices
router.post('/schedule-appointment', whatsappController.scheduleAppointment);
router.post('/send-invoice', whatsappController.sendInvoice);
router.post('/send-invoice-reminders', whatsappController.sendInvoiceReminders);

// Booking flow handling
router.post('/handle-booking-flow', whatsappController.handleBookingFlow);

router.post('/summarize', chatSummariesController.summarizeConversation);
router.post('/batch-summarize', chatSummariesController.batchSummarizeConversations);

module.exports = router;