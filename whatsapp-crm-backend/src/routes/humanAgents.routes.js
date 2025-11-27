const express = require('express');
const router = express.Router();
const humanAgentsController = require('../controllers/humanAgents.controller');

router.get('/leaderboard', humanAgentsController.getLeaderboard);
router.get('/status-dashboard', humanAgentsController.getStatusDashboard);
router.get('/:agentId/profile', humanAgentsController.getProfile);
router.get('/:agentId/performance', humanAgentsController.getPerformance);
router.post('/:agentId/shifts', humanAgentsController.createShifts);
router.get('/:agentId/schedule', humanAgentsController.getSchedule);
router.post('/:agentId/time-off', humanAgentsController.requestTimeOff);
router.put('/time-off/:requestId', humanAgentsController.reviewTimeOff);
router.post('/:agentId/break/start', humanAgentsController.startBreak);
router.post('/:agentId/break/:breakId/end', humanAgentsController.endBreak);
router.get('/:agentId/breaks', humanAgentsController.getBreakHistory);
router.post('/team-chat', humanAgentsController.sendTeamMessage);
router.get('/team-chat/:leadId', humanAgentsController.getTeamChat);
router.post('/notes', humanAgentsController.createNote);
router.get('/notes/:leadId', humanAgentsController.getNotes);
router.get('/:agentId/workload', humanAgentsController.getWorkload);
router.post('/balance-workload', humanAgentsController.balanceWorkload);

module.exports = router;