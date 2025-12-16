// const express = require('express');
// const router = express.Router();
// const { QuotesController } = require('../controllers/quotes.controller');

// // Quote CRUD
// router.post('/', QuotesController.createQuote);
// router.get('/:id', QuotesController.getQuote);
// router.get('/company/:company_id', QuotesController.listQuotes);
// router.put('/:id', QuotesController.updateQuote);

// // Quote actions
// router.post('/:id/send', QuotesController.sendQuote);
// router.post('/:id/accept', QuotesController.acceptQuote);
// router.post('/:id/reject', QuotesController.rejectQuote);
// router.post('/:id/view', QuotesController.markAsViewed);
// router.post('/:id/duplicate', QuotesController.duplicateQuote);

// // PDF generation
// router.get('/:id/pdf', QuotesController.downloadPDF);

// // Analytics
// router.get('/company/:company_id/analytics', QuotesController.getAnalytics);

// module.exports = router;





const express = require('express');
const router = express.Router();
const QuotesController = require('../controllers/quotes.controller');

// Quote CRUD routes
router.post('/', QuotesController.createQuote);
router.get('/:id', QuotesController.getQuote);
router.get('/company/:company_id', QuotesController.listQuotes);
router.put('/:id', QuotesController.updateQuote);
router.delete('/:id', QuotesController.deleteQuote);

// Quote actions
router.post('/:id/send', QuotesController.sendQuote);
router.post('/:id/accept', QuotesController.acceptQuote);
router.post('/:id/reject', QuotesController.rejectQuote);
router.post('/:id/view', QuotesController.markAsViewed);
router.post('/:id/duplicate', QuotesController.duplicateQuote);

// Quote items
router.post('/:id/items', QuotesController.addItem);
router.put('/:id/items/:item_id', QuotesController.updateItem);
router.delete('/:id/items/:item_id', QuotesController.removeItem);

// PDF & Analytics
router.get('/:id/pdf', QuotesController.downloadPDF);
router.get('/company/:company_id/analytics', QuotesController.getAnalytics);

// Templates
router.post('/templates', QuotesController.createTemplate);
router.get('/templates/company/:company_id', QuotesController.getTemplates);

module.exports = router;