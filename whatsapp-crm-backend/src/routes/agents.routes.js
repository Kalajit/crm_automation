const express = require('express');
const router = express.Router();
const agentsController = require('../controllers/agents.controller');

// Agent Configs
router.get('/configs/:company_id', agentsController.getAgentConfigsByCompany);
router.post('/configs', agentsController.createOrUpdateAgentConfig);

// Agent Instances
router.get('/instances/company/:company_id', agentsController.getAgentInstancesByCompany);
router.get('/instances/phone/:phone', agentsController.getAgentInstanceByPhone);
router.get('/instances/:id', agentsController.getAgentInstanceById);
router.post('/instances', agentsController.createAgentInstance);
router.patch('/instances/:id', agentsController.updateAgentInstance);
router.delete('/instances/:id', agentsController.deleteAgentInstance);

// Scheduled Calls
router.get('/scheduled-calls/pending', agentsController.getPendingScheduledCalls);
router.post('/scheduled-calls', agentsController.scheduleCall);
router.patch('/scheduled-calls/:id', agentsController.updateScheduledCall);

// Call Logs
router.get('/call-logs', agentsController.getAllCallLogs);
router.get('/call-logs/export/csv', agentsController.exportCallLogsCSV);
router.get('/call-logs/lead/:lead_id', agentsController.getCallLogsByLead);
router.get('/call-logs/sid/:call_sid', agentsController.getCallLogByCallSid);
router.get('/call-logs/:call_sid', agentsController.getCallLogByCallSid);
router.post('/call-logs', agentsController.createCallLog);
router.patch('/call-logs/:call_sid', agentsController.updateCallLog);

// Active calls
router.get('/active-calls', agentsController.getActiveCalls);

// Metrics
router.get('/metrics/dashboard', agentsController.getMetricsDashboard);

module.exports = router;