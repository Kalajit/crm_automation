const express = require('express');
const router = express.Router();
const conversationsController = require('../controllers/conversations.controller');

// Get or create conversation
router.post('/', conversationsController.getOrCreateConversation);

// Get conversation history by phone
router.get('/:phone', conversationsController.getConversationByPhone);

module.exports = router;