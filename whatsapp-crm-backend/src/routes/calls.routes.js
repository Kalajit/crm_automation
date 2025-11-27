const express = require('express');
const router = express.Router();
const callsController = require('../controllers/calls.controller');

// Live call update from Python
router.post('/live-update', callsController.liveUpdate);

module.exports = router;