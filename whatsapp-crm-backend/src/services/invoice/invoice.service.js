const invoicePayment = require('./invoicePayment');

/**
 * Auto-generate invoice when deal is closed
 */
async function autoGenerateInvoice(pool, data) {
  return await invoicePayment.autoGenerateInvoice(pool, data);
}

/**
 * Get invoice by ID
 */
async function getInvoiceById(pool, invoiceId) {
  return await invoicePayment.getInvoiceById(pool, invoiceId);
}

/**
 * List invoices with filters
 */
async function listInvoices(pool, filters) {
  return await invoicePayment.listInvoices(pool, filters);
}

/**
 * Sync invoice to accounting system
 */
async function syncToAccounting(pool, invoiceId, accountingSystem) {
  return await invoicePayment.syncInvoiceToAccounting(pool, invoiceId, accountingSystem);
}

module.exports = {
  autoGenerateInvoice,
  getInvoiceById,
  listInvoices,
  syncToAccounting
};