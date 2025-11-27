const express = require('express');
const router = express.Router();
const healthController = require('../controllers/health.controller');

// Detailed health check
router.get('/', healthController.healthCheck);

module.exports = router;