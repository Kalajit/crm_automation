const express = require('express');
const router = express.Router();
const smsController = require('../controllers/sms.controller');

// SMS configuration management
router.post('/config', smsController.createSmsConfig);
router.get('/config/:company_id', smsController.getSmsConfigs);
router.patch('/config/:id/toggle', smsController.toggleSmsConfig);
router.delete('/config/:id', smsController.deleteSmsConfig);

// Send SMS
router.post('/send', smsController.sendSms);

// SMS templates
router.post('/templates', smsController.createSmsTemplate);
router.get('/templates/:company_id', smsController.getSmsTemplates);
router.patch('/templates/:id', smsController.updateSmsTemplate);
router.delete('/templates/:id', smsController.deleteSmsTemplate);

// SMS campaigns
router.post('/campaigns', smsController.createSmsCampaign);
router.get('/campaigns/:company_id', smsController.getSmsCampaigns);
router.get('/campaigns/details/:campaign_id', smsController.getCampaignDetails);
router.post('/campaigns/:campaign_id/execute', smsController.executeCampaign);

// SMS history
router.get('/history/:company_id', smsController.getSmsHistory);

// Inbound SMS webhook (Twilio)
router.post('/webhook/inbound', smsController.handleInboundSms);

module.exports = router;