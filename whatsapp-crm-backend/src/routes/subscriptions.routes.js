const express = require('express');
const router = express.Router();
const subscriptionsController = require('../controllers/subscriptions.controller');

// Check expiring subscriptions and send renewals
router.post('/check-renewals', subscriptionsController.checkRenewals);

// Get active subscriptions
router.get('/active', subscriptionsController.getActiveSubscriptions);

module.exports = router;