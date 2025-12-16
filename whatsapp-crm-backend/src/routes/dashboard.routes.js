const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');

// Dashboard overview
router.get('/overview', dashboardController.getDashboardOverview);


router.get('/pipeline', dashboardController.getPipeline);
router.get('/pipeline-overview', dashboardController.getPipelineOverview);
router.get('/sales-performance', dashboardController.getSalesPerformance);
router.get('/lead-sources', dashboardController.getLeadSources);
router.get('/agent-leaderboard', dashboardController.getAgentLeaderboard);
router.get('/trends', dashboardController.getTrends);
router.get('/revenue', dashboardController.getRevenue);


module.exports = router;