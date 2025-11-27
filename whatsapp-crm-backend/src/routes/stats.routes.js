const express = require('express');
const router = express.Router();
const statsController = require('../controllers/stats.controller');

// Dashboard statistics
router.get('/dashboard', statsController.getDashboardStats);

// Lead metrics
router.get('/leads', statsController.getLeadMetrics);

// Message metrics
router.get('/messages', statsController.getMessageMetrics);

module.exports = router;