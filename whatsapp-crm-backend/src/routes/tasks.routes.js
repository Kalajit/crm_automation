const express = require('express');
const router = express.Router();
const tasksController = require('../controllers/tasks.controller');

// Task management
router.post('/', tasksController.createTask);
router.get('/agent/:agent_id', tasksController.getTasksForAgent);
router.get('/lead/:lead_id', tasksController.getTasksForLead);
router.get('/overdue/:company_id', tasksController.getOverdueTasks);
router.patch('/:id', tasksController.updateTask);
router.delete('/:id', tasksController.deleteTask);

module.exports = router;