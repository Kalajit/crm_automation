const express = require('express');
const router = express.Router();
const statsController = require('../controllers/stats.controller');

// Dashboard statistics
router.get('/dashboard', statsController.getDashboardStats);

// Lead metrics
router.get('/leads', statsController.getLeadMetrics);

// Message metrics
router.get('/messages', statsController.getMessageMetrics);

router.get('/metrics/dashboard', statsController.getMetricsDashboard);
router.get('/active-calls', statsController.getActiveCalls);

module.exports = router;