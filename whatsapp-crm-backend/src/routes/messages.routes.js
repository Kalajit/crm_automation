const express = require('express');
const router = express.Router();
const messagesController = require('../controllers/messages.controller');

// Store incoming WhatsApp message
router.post('/', messagesController.storeMessage);

// Get messages for a conversation
router.get('/:phone', messagesController.getMessagesByPhone);

module.exports = router;