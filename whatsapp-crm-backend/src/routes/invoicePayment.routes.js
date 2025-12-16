const express = require('express');
const router = express.Router();
const invoicePaymentController = require('../controllers/invoicePayment.controller');

// Invoice generation and management
router.post('/invoices/auto-generate', invoicePaymentController.autoGenerateInvoice);
router.get('/invoices/:invoice_id', invoicePaymentController.getInvoiceById);
router.get('/invoices', invoicePaymentController.listInvoices);

// Payment processing
router.post('/invoices/:invoice_id/initiate-payment', invoicePaymentController.initiatePayment);
router.post('/payment-callback', invoicePaymentController.handlePaymentCallback);
router.get('/payment-result', invoicePaymentController.paymentResult);

// Payment result pages
router.get('/payment-success.html', invoicePaymentController.paymentSuccessPage);
router.get('/payment-failed.html', invoicePaymentController.paymentFailedPage);

// Subscription management
router.post('/subscriptions/check-renewals', invoicePaymentController.checkRenewals);
router.get('/subscriptions/active', invoicePaymentController.getActiveSubscriptions);

// Overdue handling
router.post('/invoices/handle-overdue', invoicePaymentController.handleOverdue);

// Accounting sync
router.post('/invoices/:invoice_id/sync-accounting', invoicePaymentController.syncAccounting);

module.exports = router;