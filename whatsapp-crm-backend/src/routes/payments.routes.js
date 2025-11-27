const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/payments.controller');

// PhonePe payment callback
router.post('/callback', paymentsController.handlePaymentCallback);

// Payment result page
router.get('/result', paymentsController.paymentResult);

// Payment success page (HTML)
router.get('/success', paymentsController.paymentSuccessPage);

// Payment failed page (HTML)
router.get('/failed', paymentsController.paymentFailedPage);

module.exports = router;