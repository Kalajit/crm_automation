const pool = require('../config/database');
const invoiceService = require('../services/invoice/invoice.service');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Auto-generate invoice
 */
exports.autoGenerateInvoice = async (req, res) => {
  try {
    const result = await invoiceService.autoGenerateInvoice(pool, req.body);
    logRequest('POST', '/api/invoices/auto-generate', 201);
    res.status(201).json(result);
  } catch (error) {
    console.error('Auto-generate invoice error:', error);
    logRequest('POST', '/api/invoices/auto-generate', 500);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Initiate payment for invoice
 */
exports.initiatePayment = async (req, res) => {
  try {
    const { invoice_id } = req.params;
    const paymentService = require('../services/invoice/payment.service');
    const result = await paymentService.initiatePayment(pool, invoice_id);
    
    logRequest('POST', `/api/invoices/${invoice_id}/initiate-payment`, 200);
    res.json(result);
  } catch (error) {
    console.error('Payment initiation error:', error);
    logRequest('POST', `/api/invoices/${req.params.invoice_id}/initiate-payment`, 500);
    res.status(500).json({ 
      error: 'Payment initiation failed', 
      message: error.message 
    });
  }
};

/**
 * Sync invoice to accounting software
 */
exports.syncToAccounting = async (req, res) => {
  try {
    const { invoice_id } = req.params;
    const { accounting_system } = req.body;

    const result = await invoiceService.syncToAccounting(
      pool, 
      invoice_id, 
      accounting_system
    );

    logRequest('POST', `/api/invoices/${invoice_id}/sync-accounting`, 200);
    res.json(result);
  } catch (error) {
    console.error('Accounting sync error:', error);
    logRequest('POST', `/api/invoices/${req.params.invoice_id}/sync-accounting`, 500);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get invoice by ID
 */
exports.getInvoiceById = async (req, res) => {
  try {
    const { invoice_id } = req.params;
    const invoice = await invoiceService.getInvoiceById(pool, invoice_id);

    logRequest('GET', `/api/invoices/${invoice_id}`, 200);
    res.json({ success: true, invoice });
  } catch (error) {
    console.error('Get invoice error:', error);
    logRequest('GET', `/api/invoices/${req.params.invoice_id}`, 500);
    
    if (error.message === 'Invoice not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

/**
 * List all invoices with filters
 */
exports.listInvoices = async (req, res) => {
  try {
    const result = await invoiceService.listInvoices(pool, req.query);

    logRequest('GET', '/api/invoices', 200);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('List invoices error:', error);
    logRequest('GET', '/api/invoices', 500);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get invoices by lead
 */
exports.getInvoicesByLead = async (req, res) => {
  try {
    const { lead_id } = req.params;
    
    const query = `
      SELECT * FROM invoices
      WHERE lead_id = $1
      ORDER BY created_at DESC;
    `;
    
    const result = await pool.query(query, [lead_id]);
    
    logRequest('GET', `/api/invoices/lead/${lead_id}`, 200);
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/invoices/lead/${lead_id}`, 500);
    handleError(res, error);
  }
};

/**
 * Create invoice manually
 */
exports.createInvoice = async (req, res) => {
  try {
    const { lead_id, phone_number, invoice_number, amount, currency, invoice_type, due_date } = req.body;
    
    if (!lead_id || !invoice_number || !amount) {
      return res.status(400).json({ error: 'lead_id, invoice_number, and amount are required' });
    }
    
    const query = `
      INSERT INTO invoices 
      (lead_id, phone_number, invoice_number, amount, currency, invoice_type, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    
    const result = await pool.query(query, [
      lead_id,
      phone_number,
      invoice_number,
      amount,
      currency || 'INR',
      invoice_type || 'one_time',
      due_date,
    ]);
    
    logRequest('POST', '/api/invoices', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/invoices', 500);
    handleError(res, error);
  }
};