const express = require('express');
const router = express.Router();
const conversationsController = require('../controllers/conversations.controller');
const chatSummariesController = require('../controllers/chatSummaries.controller');

// Get or create conversation
router.post('/', conversationsController.getOrCreateConversation);

// Get conversation history by phone
router.get('/:phone', conversationsController.getConversationByPhone);

// New route for Part 8
router.get('/:phone/messages', conversationsController.getConversationMessages);

router.get('/:phone/summary', chatSummariesController.getConversationSummary);

module.exports = router;