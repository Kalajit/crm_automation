const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');

// Get all pending notifications
router.get('/pending/all', notificationsController.getAllPendingNotifications);

// Get pending notifications by phone
router.get('/pending/:phone', notificationsController.getPendingNotificationsByPhone);

// Create notification
router.post('/', notificationsController.createNotification);

// Mark notification as sent
router.patch('/:id/sent', notificationsController.markNotificationSent);

module.exports = router;