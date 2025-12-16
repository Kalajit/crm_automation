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



router.get('/dashboard', analyticsController.getDashboard);
router.get('/activity', analyticsController.getActivity);
router.get('/pipeline', analyticsController.getPipeline);
router.get('/velocity', analyticsController.getVelocity);
router.get('/forecast', analyticsController.getForecast);
router.get('/churn-prediction', analyticsController.getChurnPrediction);
router.post('/custom-report', analyticsController.buildCustomReport);
router.post('/compare', analyticsController.comparePeriods);
router.post('/export/csv', analyticsController.exportCSV);
router.post('/export/excel', analyticsController.exportExcel);


// route for Part 8
router.post('/event', analyticsController.trackEvent);

// Complete lead analytics
router.get('/leads-complete/:company_id', analyticsController.getCompleteLeadAnalytics);


module.exports = router;