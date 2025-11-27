const express = require('express');
const router = express.Router();
const faqsController = require('../controllers/faqs.controller');

// Get all active FAQs
router.get('/', faqsController.getAllFaqs);

// Create FAQ
router.post('/', faqsController.createFaq);

module.exports = router;