const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');

// Revenue dashboard
router.get('/revenue-dashboard', reportsController.getRevenueDashboard);

// Overdue invoices report
router.get('/overdue-invoices', reportsController.getOverdueInvoices);

// Churn analysis
router.get('/churn-analysis', reportsController.getChurnAnalysis);

module.exports = router;