const express = require('express');
const router = express.Router();
const callSummariesController = require('../controllers/callSummaries.controller');

// Send call summary
router.post('/send', callSummariesController.sendCallSummary);

// Get call summary
router.get('/:call_sid', callSummariesController.getCallSummary);

// Regenerate call summary
router.post('/regenerate', callSummariesController.regenerateCallSummary);

module.exports = router;