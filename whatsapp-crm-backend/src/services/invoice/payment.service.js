const invoicePayment = require('./invoicePayment');

/**
 * Initiate PhonePe payment
 */
async function initiatePayment(pool, invoiceId) {
  return await invoicePayment.initiatePayment(pool, invoiceId);
}

/**
 * Handle payment callback
 */
async function handlePaymentCallback(pool, callbackResponse) {
  return await invoicePayment.handlePaymentCallback(pool, callbackResponse);
}

/**
 * Check payment status
 */
async function checkPaymentStatus(pool, invoiceId, merchantOrderId) {
  return await invoicePayment.checkPaymentStatus(pool, invoiceId, merchantOrderId);
}

/**
 * Process partial payment
 */
async function processPartialPayment(pool, invoiceId, amount, paymentMethod) {
  return await invoicePayment.recordPartialPayment(pool, invoiceId, amount, paymentMethod);
}

/**
 * Process refund
 */
async function processRefund(pool, invoiceId, refundAmount, reason) {
  return await invoicePayment.processRefund(pool, invoiceId, refundAmount, reason);
}

/**
 * Retry failed payment
 */
async function retryFailedPayment(pool, invoiceId, maxRetries) {
  return await invoicePayment.retryFailedPayment(pool, invoiceId, maxRetries);
}

module.exports = {
  initiatePayment,
  handlePaymentCallback,
  checkPaymentStatus,
  processPartialPayment,
  processRefund,
  retryFailedPayment
};