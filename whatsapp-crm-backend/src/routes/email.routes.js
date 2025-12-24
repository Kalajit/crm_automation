const express = require('express');
const router = express.Router();
const emailController = require('../controllers/email.controller');

const {authenticateToken } = require('../middleware/auth.middleware');


// Gmail OAuth - PUBLIC
router.get('/oauth/gmail/callback', emailController.handleGmailCallback);

// Outlook OAuth - PUBLIC
router.get('/oauth/outlook/callback', emailController.handleOutlookCallback);


// Apply authentication middleware to all routes below
router.use(authenticateToken);


// Email configuration management
router.post('/config', emailController.createEmailConfig);
router.get('/config/:company_id', emailController.getEmailConfigs);
router.patch('/config/:id/toggle', emailController.toggleEmailConfig);
router.delete('/config/:id', emailController.deleteEmailConfig);

// Email processing
router.post('/process', emailController.processEmail);
router.post('/scan/:company_id', emailController.scanCompanyEmails);

// Email scan logs
router.get('/scan-logs/:company_id', emailController.getScanLogs);

// Email status
router.get('/status/:company_id', emailController.getEmailStatus);
router.delete('/disconnect/:email_config_id', emailController.disconnectEmail);

// Gmail OAuth
router.get('/oauth/gmail/start', emailController.startGmailOAuth);
// router.get('/oauth/gmail/callback', emailController.handleGmailCallback);

// Outlook OAuth
router.get('/oauth/outlook/start', emailController.startOutlookOAuth);
// router.get('/oauth/outlook/callback', emailController.handleOutlookCallback);

module.exports = router;