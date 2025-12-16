const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');
const advancedReportsController = require('../controllers/advancedReports.controller');
const invoicePaymentController = require('../controllers/invoicePayment.controller');

// Revenue dashboard
router.get('/revenue-dashboard', reportsController.getRevenueDashboard);

// Overdue invoices report
router.get('/overdue-invoices', reportsController.getOverdueInvoices);

// Churn analysis
router.get('/churn-analysis', reportsController.getChurnAnalysis);

router.get('/agent-performance', advancedReportsController.getAgentPerformance);
router.get('/revenue-forecast', advancedReportsController.getRevenueForecast);
router.get('/churn-prediction', advancedReportsController.getChurnPrediction);
router.get('/campaign-roi', advancedReportsController.getCampaignROI);
router.post('/schedule', advancedReportsController.scheduleReport);
router.get('/scheduled/:company_id', advancedReportsController.getScheduledReports);


// NEW: Invoice & Payment reports (Part 17)
// router.get('/revenue-dashboard', invoicePaymentController.getRevenueDashboard);
// router.get('/overdue-invoices', invoicePaymentController.getOverdueReport);
// router.get('/churn-analysis', invoicePaymentController.getChurnAnalysis);

module.exports = router;