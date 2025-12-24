const express = require('express');
const router = express.Router();
const callsController = require('../controllers/calls.controller');

// Live call update from Python
router.post('/live-update', callsController.liveUpdate);


// New route for Part 8
router.get('/scheduled/pending', callsController.getPendingScheduledCalls);

router.post('/call-logs', callsController.createCallLog);
router.patch('/call-logs/:call_sid', callsController.updateCallLog);
router.get('/call-logs/lead/:lead_id', callsController.getCallLogsByLead);
router.get('/call-logs', callsController.getCallLogs);
router.get('/call-logs/:call_sid', callsController.getCallLogByCallSid);
router.get('/call-logs/sid/:call_sid', callsController.getCallLogByCallSid); // Alternative route
router.get('/call-logs/export/csv', callsController.exportCallLogsToCSV);
router.get('/active-calls', callsController.getActiveCalls);


module.exports = router;