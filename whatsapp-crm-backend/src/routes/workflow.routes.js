const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/workflow.controller');

// Lead workflow endpoints (for n8n/automation)
router.post('/check-lead', workflowController.checkLead);
router.post('/create-lead', workflowController.createLead);
router.post('/update-lead', workflowController.updateLead);
router.post('/send-welcome', workflowController.sendWelcome);
router.post('/schedule-call', workflowController.scheduleCall);
router.post('/log-import', workflowController.logImport);

module.exports = router;