const express = require('express');
const router = express.Router();
const invoicesController = require('../controllers/invoices.controller');

// Auto-generate invoice
router.post('/auto-generate', invoicesController.autoGenerateInvoice);

// Initiate payment for invoice
router.post('/:invoice_id/initiate-payment', invoicesController.initiatePayment);

// Sync invoice to accounting software
router.post('/:invoice_id/sync-accounting', invoicesController.syncToAccounting);

// Get invoices by lead
router.get('/lead/:lead_id', invoicesController.getInvoicesByLead);

// Get all invoices with filters
router.get('/', invoicesController.listInvoices);

// Get invoice by ID
router.get('/:invoice_id', invoicesController.getInvoiceById);

// Create invoice
router.post('/', invoicesController.createInvoice);

module.exports = router;