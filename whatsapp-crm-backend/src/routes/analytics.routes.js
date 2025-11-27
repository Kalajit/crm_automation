const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');

// Track events
router.post('/events', analyticsController.trackEvent);

// Get analytics summary
router.get('/summary', analyticsController.getAnalyticsSummary);

// Hot leads
router.get('/hot-leads', analyticsController.getHotLeads);

// Failed calls
router.get('/failed-calls', analyticsController.getFailedCalls);

// Daily summary report
router.get('/daily-summary', analyticsController.getDailySummary);

// AI fallback
router.post('/ai-fallback', analyticsController.aiFollback);

// Rate check
router.get('/rate-check/:phone', analyticsController.rateCheck);

// System status
router.get('/system-status', analyticsController.systemStatus);

module.exports = router;