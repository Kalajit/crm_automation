const express = require('express');
const router = express.Router();
const routingController = require('../controllers/routing.controller');

// Routing rules management
router.post('/rules', routingController.createRoutingRule);
router.get('/rules/:company_id', routingController.getRoutingRules);
router.patch('/rules/:id', routingController.updateRoutingRule);
router.delete('/rules/:id', routingController.deleteRoutingRule);

// Apply routing
router.post('/leads/:lead_id/apply', routingController.applyRoutingToLead);

module.exports = router;