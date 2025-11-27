const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system.controller');

// System notifications
router.get('/notifications', systemController.getSystemNotifications);
router.post('/notifications', systemController.createSystemNotification);
router.patch('/notifications/:id/read', systemController.markNotificationAsRead);

// Alerts
router.get('/alerts', systemController.getAlerts);
router.post('/alerts', systemController.createAlert);

// Email queue
router.get('/email-queue/pending', systemController.getPendingEmails);
router.post('/email-queue', systemController.queueEmail);

// Audit logs
router.post('/audit-log', systemController.createAuditLog);

// Recordings
router.get('/recordings/:call_sid', systemController.getRecording);

module.exports = router;