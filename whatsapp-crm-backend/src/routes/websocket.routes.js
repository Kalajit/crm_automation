const express = require('express');
const router = express.Router();
const wsController = require('../controllers/websocket.controller');

// Get WebSocket statistics
router.get('/stats', wsController.getStats);

module.exports = router;