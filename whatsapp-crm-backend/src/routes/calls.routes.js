const express = require('express');
const router = express.Router();
const callsController = require('../controllers/calls.controller');

// Live call update from Python
router.post('/live-update', callsController.liveUpdate);


// New route for Part 8
router.get('/scheduled/pending', callsController.getPendingScheduledCalls);


module.exports = router;