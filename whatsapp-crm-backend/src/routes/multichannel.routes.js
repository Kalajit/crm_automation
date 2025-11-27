const express = require('express');
const router = express.Router();
const multiChannelController = require('../controllers/multiChannel.controller');

// SMS
router.post('/sms/send', multiChannelController.sendSMS);
router.post('/sms/webhook', multiChannelController.smsWebhook);
router.get('/sms/history/:leadId', multiChannelController.getSMSHistory);

// Web Chat
router.post('/webchat/init', multiChannelController.initWebChat);
router.post('/webchat/message', multiChannelController.sendWebChatMessage);
router.get('/webchat/:sessionId/messages', multiChannelController.getWebChatMessages);
router.post('/webchat/:sessionId/assign', multiChannelController.assignWebChat);
router.post('/webchat/:sessionId/end', multiChannelController.endWebChat);
router.get('/webchat/active', multiChannelController.getActiveChats);

// Social Media
router.post('/social/connect', multiChannelController.connectSocial);
router.post('/social/:accountId/sync', multiChannelController.syncSocial);
router.post('/social/:accountId/send', multiChannelController.sendSocialMessage);
router.get('/social/:accountId/messages', multiChannelController.getSocialMessages);
router.post('/social/webhook/:platform', multiChannelController.socialWebhook);
router.get('/social/webhook/:platform', multiChannelController.verifySocialWebhook);

module.exports = router;