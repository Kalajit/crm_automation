const pool = require('../config/database');
const paymentService = require('../services/invoice/payment.service');
const { logRequest } = require('../utils/logger');

/**
 * Handle PhonePe payment callback
 */
exports.handlePaymentCallback = async (req, res) => {
  try {
    const { response } = req.body;
    const result = await paymentService.handlePaymentCallback(pool, response);
    res.json(result);
  } catch (error) {
    console.error('Payment callback error:', error);
    res.status(500).json({ error: 'Callback processing failed' });
  }
};

/**
 * Payment result page - Check status and redirect
 */
exports.paymentResult = async (req, res) => {
  try {
    const { invoice_id, orderId } = req.query;

    if (!invoice_id || !orderId) {
      return res.redirect('/payment-failed?error=missing_params');
    }

    const result = await paymentService.checkPaymentStatus(pool, invoice_id, orderId);

    if (result.success && result.status === 'completed') {
      res.redirect(`/payment-success?invoice_id=${invoice_id}&txn_id=${orderId}`);
    } else {
      res.redirect(`/payment-failed?invoice_id=${invoice_id}&reason=${result.status}`);
    }
  } catch (error) {
    console.error('Payment result error:', error);
    res.redirect('/payment-failed?error=status_check_failed');
  }
};

/**
 * Payment success HTML page
 */
exports.paymentSuccessPage = (req, res) => {
  const { invoice_id, txn_id } = req.query;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Successful</title>
      <style>
        body { font-family: Arial; text-align: center; padding: 50px; background: #f0f9ff; }
        .success-box { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
        .checkmark { color: #4CAF50; font-size: 80px; }
        h1 { color: #333; }
        p { color: #666; font-size: 16px; }
        .details { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="success-box">
        <div class="checkmark">✓</div>
        <h1>Payment Successful!</h1>
        <p>Your payment has been processed successfully.</p>
        <div class="details">
          <p><strong>Invoice ID:</strong> ${invoice_id || 'N/A'}</p>
          <p><strong>Transaction ID:</strong> ${txn_id || 'N/A'}</p>
        </div>
        <p>Thank you for your payment!</p>
      </div>
    </body>
    </html>
  `);
};

/**
 * Payment failed HTML page
 */
exports.paymentFailedPage = (req, res) => {
  const { invoice_id, reason, error } = req.query;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Failed</title>
      <style>
        body { font-family: Arial; text-align: center; padding: 50px; background: #fff5f5; }
        .error-box { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
        .error-icon { color: #f44336; font-size: 80px; }
        h1 { color: #333; }
        p { color: #666; font-size: 16px; }
        .details { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; }
        button { background: #2196F3; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; font-size: 16px; }
      </style>
    </head>
    <body>
      <div class="error-box">
        <div class="error-icon">✗</div>
        <h1>Payment Failed</h1>
        <p>We couldn't process your payment.</p>
        <div class="details">
          <p><strong>Invoice ID:</strong> ${invoice_id || 'N/A'}</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          ${error ? `<p><strong>Error:</strong> ${error}</p>` : ''}
        </div>
        <button onclick="window.history.back()">Try Again</button>
      </div>
    </body>
    </html>
  `);
};