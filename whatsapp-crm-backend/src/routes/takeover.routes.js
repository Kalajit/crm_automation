const express = require('express');
const router = express.Router();
const takeoverController = require('../controllers/takeover.controller');

// Takeover requests
router.post('/request', takeoverController.createTakeoverRequest);
router.get('/my-requests/:agent_id', takeoverController.getMyTakeoverRequests);
router.patch('/:id/accept', takeoverController.acceptTakeover);
router.patch('/:id/complete', takeoverController.completeTakeover);

// Human agents
router.get('/agents', takeoverController.getAllHumanAgents);
router.patch('/agents/:id/status', takeoverController.updateAgentStatus);

module.exports = router;