// // const pool = require('../config/database');
// // const logger = require('../utils/logger');
// // const invoicePaymentService = require('../services/invoicePayment/invoicePayment.service');
// // const { successResponse, errorResponse } = require('../utils/response');

// // // Get usage column mapping
// // function getUsageColumn(eventType) {
// //   const mapping = {
// //     'whatsapp_message': 'whatsapp_messages_sent',
// //     'voice_call': 'voice_minutes_used',
// //     'lead_created': 'leads_created',
// //     'ai_token': 'ai_tokens_used'
// //   };
// //   return mapping[eventType] || 'whatsapp_messages_sent';
// // }

// // // Track usage event
// // exports.trackUsage = async (companyId, eventType, quantity = 1, metadata = {}) => {
// //   try {
// //     await pool.query(`
// //       INSERT INTO usage_events (company_id, event_type, quantity, metadata)
// //       VALUES ($1, $2, $3, $4)
// //     `, [companyId, eventType, quantity, JSON.stringify(metadata)]);
    
// //     const now = new Date();
// //     const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
// //     const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
// //     const column = getUsageColumn(eventType);
    
// //     await pool.query(`
// //       INSERT INTO company_usage (
// //         company_id, period_start, period_end, ${column}
// //       ) VALUES ($1, $2, $3, $4)
// //       ON CONFLICT (company_id, period_start) DO UPDATE
// //       SET ${column} = company_usage.${column} + $4,
// //           updated_at = NOW()
// //     `, [companyId, periodStart, periodEnd, quantity]);
    
// //   } catch (error) {
// //     logger.error('Usage tracking error:', error);
// //   }
// // };

// // // Check usage limit
// // exports.checkUsageLimit = async (companyId, eventType) => {
// //   try {
// //     const result = await pool.query(`
// //       SELECT 
// //         cs.*,
// //         bp.max_whatsapp_messages,
// //         bp.max_voice_minutes,
// //         bp.max_leads,
// //         cu.whatsapp_messages_sent,
// //         cu.voice_minutes_used,
// //         cu.leads_created
// //       FROM company_subscriptions cs
// //       JOIN company_billing_plans bp ON cs.plan_id = bp.id
// //       LEFT JOIN company_usage cu ON cu.company_id = cs.company_id
// //         AND cu.period_start <= NOW() 
// //         AND cu.period_end >= NOW()
// //       WHERE cs.company_id = $1 AND cs.status = 'active'
// //       ORDER BY cs.created_at DESC
// //       LIMIT 1
// //     `, [companyId]);
    
// //     if (result.rows.length === 0) {
// //       return { allowed: false, reason: 'No active subscription' };
// //     }
    
// //     const sub = result.rows[0];
    
// //     const checks = {
// //       'whatsapp_message': {
// //         used: sub.whatsapp_messages_sent || 0,
// //         limit: sub.max_whatsapp_messages
// //       },
// //       'voice_call': {
// //         used: sub.voice_minutes_used || 0,
// //         limit: sub.max_voice_minutes
// //       },
// //       'lead_created': {
// //         used: sub.leads_created || 0,
// //         limit: sub.max_leads
// //       }
// //     };
    
// //     const check = checks[eventType];
// //     if (!check) {
// //       return { allowed: true };
// //     }
    
// //     if (check.used >= check.limit) {
// //       return {
// //         allowed: false,
// //         reason: 'Usage limit exceeded',
// //         used: check.used,
// //         limit: check.limit
// //       };
// //     }
    
// //     return {
// //       allowed: true,
// //       used: check.used,
// //       limit: check.limit,
// //       remaining: check.limit - check.used
// //     };
    
// //   } catch (error) {
// //     logger.error('Usage limit check error:', error);
// //     return { allowed: true };
// //   }
// // };



const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');
const invoicePayment = require('../services/invoice/invoicePayment.service');

// Auto-generate invoice
const autoGenerateInvoice = async (req, res) => {
  try {
    const result = await invoicePayment.autoGenerateInvoice(pool, req.body);
    logger.info('POST', '/api/invoices/auto-generate', 201);
    return successResponse(res, result, 'Invoice auto-generated successfully', 201);
  } catch (error) {
    logger.error('Auto-generate invoice error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Initiate PhonePe payment
const initiatePayment = async (req, res) => {
  try {
    const { invoice_id } = req.params;
    const result = await invoicePayment.initiatePayment(pool, invoice_id);
    logger.info('POST', `/api/invoices/${invoice_id}/initiate-payment`, 200);
    return successResponse(res, result, 'Payment initiated successfully');
  } catch (error) {
    logger.error('Payment initiation error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Handle PhonePe callback
const handlePaymentCallback = async (req, res) => {
  try {
    const { response } = req.body;
    const result = await invoicePayment.handlePaymentCallback(pool, response);
    return successResponse(res, result, 'Callback processed successfully');
  } catch (error) {
    logger.error('Payment callback error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Payment result page
const paymentResult = async (req, res) => {
  try {
    const { invoice_id, orderId } = req.query;

    if (!invoice_id || !orderId) {
      return res.redirect('/payment-failed.html?error=missing_params');
    }

    const result = await invoicePayment.checkPaymentStatus(pool, invoice_id, orderId);

    if (result.success && result.status === 'completed') {
      res.redirect(`/payment-success.html?invoice_id=${invoice_id}&txn_id=${orderId}`);
    } else {
      res.redirect(`/payment-failed.html?invoice_id=${invoice_id}&reason=${result.status}`);
    }

  } catch (error) {
    logger.error('Payment result error:', error);
    res.redirect('/payment-failed.html?error=status_check_failed');
  }
};

// Check subscription renewals
const checkRenewals = async (req, res) => {
  try {
    const result = await invoicePayment.checkRenewals(pool);
    logger.info('POST', '/api/subscriptions/check-renewals', 200);
    return successResponse(res, result, 'Renewals checked successfully');
  } catch (error) {
    logger.error('Check renewals error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Handle overdue invoices
const handleOverdue = async (req, res) => {
  try {
    const result = await invoicePayment.handleOverdueInvoices(pool);
    logger.info('POST', '/api/invoices/handle-overdue', 200);
    return successResponse(res, result, 'Overdue invoices processed successfully');
  } catch (error) {
    logger.error('Handle overdue error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Sync to accounting
const syncAccounting = async (req, res) => {
  try {
    const { invoice_id } = req.params;
    const { accounting_system } = req.body;

    const result = await invoicePayment.syncInvoiceToAccounting(
      pool, 
      invoice_id, 
      accounting_system
    );

    logger.info('POST', `/api/invoices/${invoice_id}/sync-accounting`, 200);
    return successResponse(res, result, 'Invoice synced to accounting system');

  } catch (error) {
    logger.error('Accounting sync error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get revenue dashboard
const getRevenueDashboard = async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;

    const result = await invoicePayment.getRevenueDashboard(
      pool, 
      company_id, 
      start_date, 
      end_date
    );

    logger.info('GET', '/api/reports/revenue-dashboard', 200);
    return successResponse(res, result, 'Revenue dashboard retrieved successfully');

  } catch (error) {
    logger.error('Revenue dashboard error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get overdue invoices report
const getOverdueReport = async (req, res) => {
  try {
    const { company_id } = req.query;

    const result = await invoicePayment.getOverdueInvoicesReport(pool, company_id);

    logger.info('GET', '/api/reports/overdue-invoices', 200);
    return successResponse(res, result, 'Overdue report retrieved successfully');

  } catch (error) {
    logger.error('Overdue report error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get churn analysis
const getChurnAnalysis = async (req, res) => {
  try {
    const { company_id, months = 6 } = req.query;

    const result = await invoicePayment.getChurnAnalysis(pool, company_id, months);

    logger.info('GET', '/api/reports/churn-analysis', 200);
    return successResponse(res, result, 'Churn analysis retrieved successfully');

  } catch (error) {
    logger.error('Churn analysis error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get active subscriptions
const getActiveSubscriptions = async (req, res) => {
  try {
    const { company_id } = req.query;

    const result = await invoicePayment.getActiveSubscriptions(pool, company_id);

    logger.info('GET', '/api/subscriptions/active', 200);
    return successResponse(res, result, 'Active subscriptions retrieved successfully');

  } catch (error) {
    logger.error('Active subscriptions error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get invoice by ID
const getInvoiceById = async (req, res) => {
  try {
    const { invoice_id } = req.params;

    const invoice = await invoicePayment.getInvoiceById(pool, invoice_id);

    logger.info('GET', `/api/invoices/${invoice_id}`, 200);
    return successResponse(res, { invoice }, 'Invoice retrieved successfully');

  } catch (error) {
    logger.error('Get invoice error:', error);
    
    if (error.message === 'Invoice not found') {
      return errorResponse(res, error.message, 404);
    } else {
      return errorResponse(res, error.message, 500);
    }
  }
};

// List all invoices
const listInvoices = async (req, res) => {
  try {
    const result = await invoicePayment.listInvoices(pool, req.query);

    logger.info('GET', '/api/invoices', 200);
    return successResponse(res, result, 'Invoices retrieved successfully');

  } catch (error) {
    logger.error('List invoices error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Payment success page
const paymentSuccessPage = (req, res) => {
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

// Payment failed page
const paymentFailedPage = (req, res) => {
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

// EXPORTS - ALL FUNCTIONS
module.exports = {
  autoGenerateInvoice,
  initiatePayment,
  handlePaymentCallback,
  paymentResult,
  checkRenewals,
  handleOverdue,
  syncAccounting,
  getRevenueDashboard,
  getOverdueReport,
  getChurnAnalysis,
  getActiveSubscriptions,
  getInvoiceById,
  listInvoices,
  paymentSuccessPage,
  paymentFailedPage
};





// // src/controllers/invoicePayment.controller.js
// const pool = require('../config/database');
// const invoicePaymentService = require('../services/invoice/invoicePayment.service');
// const { successResponse, errorResponse } = require('../utils/response');
// const logger = require('../utils/logger');

// // ============================================
// // INVOICE GENERATION
// // ============================================

// exports.autoGenerateInvoice = async (req, res) => {
//   try {
//     const {
//       lead_id,
//       amount,
//       invoice_type,
//       due_date,
//       subscription_months,
//       description,
//       company_id
//     } = req.body;

//     if (!lead_id || !amount || !invoice_type) {
//       return errorResponse(res, 'lead_id, amount, and invoice_type are required', 400);
//     }

//     const result = await invoicePaymentService.autoGenerateInvoice(pool, {
//       lead_id,
//       amount,
//       invoice_type,
//       due_date,
//       subscription_months,
//       description,
//       company_id
//     });

//     logger.info('POST', '/api/invoices/auto-generate', 201);
//     return successResponse(res, result, 'Invoice generated successfully', 201);
//   } catch (error) {
//     logger.error('Auto-generate invoice error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// exports.getInvoiceById = async (req, res) => {
//   try {
//     const { invoice_id } = req.params;

//     const invoice = await invoicePaymentService.getInvoiceById(pool, invoice_id);

//     logger.info('GET', `/api/invoices/${invoice_id}`, 200);
//     return successResponse(res, invoice, 'Invoice retrieved successfully');
//   } catch (error) {
//     logger.error('Get invoice error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// exports.listInvoices = async (req, res) => {
//   try {
//     const filters = {
//       company_id: req.query.company_id,
//       status: req.query.status,
//       invoice_type: req.query.invoice_type,
//       start_date: req.query.start_date,
//       end_date: req.query.end_date,
//       limit: req.query.limit || 50,
//       offset: req.query.offset || 0
//     };

//     const result = await invoicePaymentService.listInvoices(pool, filters);

//     logger.info('GET', '/api/invoices', 200);
//     return successResponse(res, result, 'Invoices retrieved successfully');
//   } catch (error) {
//     logger.error('List invoices error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// // ============================================
// // PAYMENT PROCESSING
// // ============================================

// exports.initiatePayment = async (req, res) => {
//   try {
//     const { invoice_id } = req.params;

//     const result = await invoicePaymentService.initiatePayment(pool, invoice_id);

//     logger.info('POST', `/api/invoices/${invoice_id}/initiate-payment`, 200);
//     return successResponse(res, result, 'Payment initiated successfully');
//   } catch (error) {
//     logger.error('Initiate payment error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// exports.handlePaymentCallback = async (req, res) => {
//   try {
//     logger.info('Payment callback received:', req.body);

//     // PhonePe sends base64 encoded response
//     const response = req.body.response || req.body;

//     const result = await invoicePaymentService.handlePaymentCallback(pool, response);

//     logger.info('POST', '/api/payment-callback', 200);
//     return successResponse(res, result, 'Payment callback processed successfully');
//   } catch (error) {
//     logger.error('Payment callback error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// exports.paymentResult = async (req, res) => {
//   try {
//     const { invoice_id, orderId } = req.query;

//     if (!invoice_id || !orderId) {
//       return errorResponse(res, 'invoice_id and orderId are required', 400);
//     }

//     const result = await invoicePaymentService.checkPaymentStatus(
//       pool,
//       invoice_id,
//       orderId
//     );

//     logger.info('GET', '/api/payment-result', 200);

//     // Redirect based on payment status
//     if (result.success) {
//       return res.redirect(`/api/payment-success.html?invoice_id=${invoice_id}&reference=${result.referenceId}`);
//     } else {
//       return res.redirect(`/api/payment-failed.html?invoice_id=${invoice_id}&reason=${result.status}`);
//     }
//   } catch (error) {
//     logger.error('Payment result error:', error);
//     return res.redirect(`/api/payment-failed.html?error=${encodeURIComponent(error.message)}`);
//   }
// };

// // ============================================
// // PAYMENT RESULT PAGES
// // ============================================

// exports.paymentSuccessPage = (req, res) => {
//   const { invoice_id, reference } = req.query;

//   const html = `
//     <!DOCTYPE html>
//     <html lang="en">
//     <head>
//       <meta charset="UTF-8">
//       <meta name="viewport" content="width=device-width, initial-scale=1.0">
//       <title>Payment Successful</title>
//       <style>
//         * { margin: 0; padding: 0; box-sizing: border-box; }
//         body {
//           font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
//           background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//           min-height: 100vh;
//           display: flex;
//           align-items: center;
//           justify-content: center;
//           padding: 20px;
//         }
//         .container {
//           background: white;
//           border-radius: 20px;
//           box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
//           padding: 50px;
//           max-width: 500px;
//           width: 100%;
//           text-align: center;
//           animation: slideUp 0.5s ease-out;
//         }
//         @keyframes slideUp {
//           from { opacity: 0; transform: translateY(30px); }
//           to { opacity: 1; transform: translateY(0); }
//         }
//         .success-icon {
//           width: 80px;
//           height: 80px;
//           background: #10b981;
//           border-radius: 50%;
//           display: flex;
//           align-items: center;
//           justify-content: center;
//           margin: 0 auto 30px;
//           animation: scaleIn 0.5s ease-out 0.2s both;
//         }
//         @keyframes scaleIn {
//           from { transform: scale(0); }
//           to { transform: scale(1); }
//         }
//         .success-icon svg {
//           width: 50px;
//           height: 50px;
//           stroke: white;
//           stroke-width: 3;
//           fill: none;
//           stroke-linecap: round;
//           stroke-linejoin: round;
//         }
//         h1 {
//           color: #10b981;
//           font-size: 32px;
//           margin-bottom: 15px;
//         }
//         p {
//           color: #6b7280;
//           font-size: 16px;
//           line-height: 1.6;
//           margin-bottom: 30px;
//         }
//         .info-box {
//           background: #f3f4f6;
//           border-radius: 10px;
//           padding: 20px;
//           margin-bottom: 30px;
//           text-align: left;
//         }
//         .info-row {
//           display: flex;
//           justify-content: space-between;
//           padding: 10px 0;
//           border-bottom: 1px solid #e5e7eb;
//         }
//         .info-row:last-child { border-bottom: none; }
//         .info-label {
//           color: #6b7280;
//           font-weight: 500;
//         }
//         .info-value {
//           color: #1f2937;
//           font-weight: 600;
//         }
//         .btn {
//           display: inline-block;
//           background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//           color: white;
//           padding: 15px 40px;
//           border-radius: 10px;
//           text-decoration: none;
//           font-weight: 600;
//           transition: transform 0.2s;
//         }
//         .btn:hover {
//           transform: translateY(-2px);
//         }
//       </style>
//     </head>
//     <body>
//       <div class="container">
//         <div class="success-icon">
//           <svg viewBox="0 0 24 24">
//             <polyline points="20 6 9 17 4 12"></polyline>
//           </svg>
//         </div>
//         <h1>Payment Successful!</h1>
//         <p>Your payment has been processed successfully. Thank you for your business!</p>
        
//         <div class="info-box">
//           <div class="info-row">
//             <span class="info-label">Invoice ID</span>
//             <span class="info-value">${invoice_id || 'N/A'}</span>
//           </div>
//           <div class="info-row">
//             <span class="info-label">Reference ID</span>
//             <span class="info-value">${reference || 'N/A'}</span>
//           </div>
//           <div class="info-row">
//             <span class="info-label">Status</span>
//             <span class="info-value" style="color: #10b981;">PAID</span>
//           </div>
//         </div>

//         <a href="/" class="btn">Back to Dashboard</a>
//       </div>
//     </body>
//     </html>
//   `;

//   res.setHeader('Content-Type', 'text/html');
//   res.send(html);
// };

// exports.paymentFailedPage = (req, res) => {
//   const { invoice_id, reason, error } = req.query;

//   const html = `
//     <!DOCTYPE html>
//     <html lang="en">
//     <head>
//       <meta charset="UTF-8">
//       <meta name="viewport" content="width=device-width, initial-scale=1.0">
//       <title>Payment Failed</title>
//       <style>
//         * { margin: 0; padding: 0; box-sizing: border-box; }
//         body {
//           font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
//           background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
//           min-height: 100vh;
//           display: flex;
//           align-items: center;
//           justify-content: center;
//           padding: 20px;
//         }
//         .container {
//           background: white;
//           border-radius: 20px;
//           box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
//           padding: 50px;
//           max-width: 500px;
//           width: 100%;
//           text-align: center;
//           animation: slideUp 0.5s ease-out;
//         }
//         @keyframes slideUp {
//           from { opacity: 0; transform: translateY(30px); }
//           to { opacity: 1; transform: translateY(0); }
//         }
//         .error-icon {
//           width: 80px;
//           height: 80px;
//           background: #ef4444;
//           border-radius: 50%;
//           display: flex;
//           align-items: center;
//           justify-content: center;
//           margin: 0 auto 30px;
//           animation: scaleIn 0.5s ease-out 0.2s both;
//         }
//         @keyframes scaleIn {
//           from { transform: scale(0); }
//           to { transform: scale(1); }
//         }
//         .error-icon svg {
//           width: 50px;
//           height: 50px;
//           stroke: white;
//           stroke-width: 3;
//           fill: none;
//           stroke-linecap: round;
//           stroke-linejoin: round;
//         }
//         h1 {
//           color: #ef4444;
//           font-size: 32px;
//           margin-bottom: 15px;
//         }
//         p {
//           color: #6b7280;
//           font-size: 16px;
//           line-height: 1.6;
//           margin-bottom: 30px;
//         }
//         .info-box {
//           background: #fef2f2;
//           border: 1px solid #fecaca;
//           border-radius: 10px;
//           padding: 20px;
//           margin-bottom: 30px;
//           text-align: left;
//         }
//         .info-row {
//           display: flex;
//           justify-content: space-between;
//           padding: 10px 0;
//           border-bottom: 1px solid #fecaca;
//         }
//         .info-row:last-child { border-bottom: none; }
//         .info-label {
//           color: #6b7280;
//           font-weight: 500;
//         }
//         .info-value {
//           color: #1f2937;
//           font-weight: 600;
//         }
//         .btn-group {
//           display: flex;
//           gap: 15px;
//           justify-content: center;
//         }
//         .btn {
//           display: inline-block;
//           padding: 15px 30px;
//           border-radius: 10px;
//           text-decoration: none;
//           font-weight: 600;
//           transition: transform 0.2s;
//         }
//         .btn-primary {
//           background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//           color: white;
//         }
//         .btn-secondary {
//           background: #f3f4f6;
//           color: #1f2937;
//         }
//         .btn:hover {
//           transform: translateY(-2px);
//         }
//       </style>
//     </head>
//     <body>
//       <div class="container">
//         <div class="error-icon">
//           <svg viewBox="0 0 24 24">
//             <line x1="18" y1="6" x2="6" y2="18"></line>
//             <line x1="6" y1="6" x2="18" y2="18"></line>
//           </svg>
//         </div>
//         <h1>Payment Failed</h1>
//         <p>We couldn't process your payment. Please try again or contact support if the issue persists.</p>
        
//         <div class="info-box">
//           <div class="info-row">
//             <span class="info-label">Invoice ID</span>
//             <span class="info-value">${invoice_id || 'N/A'}</span>
//           </div>
//           <div class="info-row">
//             <span class="info-label">Status</span>
//             <span class="info-value" style="color: #ef4444;">FAILED</span>
//           </div>
//           ${reason ? `
//           <div class="info-row">
//             <span class="info-label">Reason</span>
//             <span class="info-value">${reason}</span>
//           </div>
//           ` : ''}
//           ${error ? `
//           <div class="info-row">
//             <span class="info-label">Error</span>
//             <span class="info-value">${error}</span>
//           </div>
//           ` : ''}
//         </div>

//         <div class="btn-group">
//           ${invoice_id ? `<a href="/api/invoices/${invoice_id}/initiate-payment" class="btn btn-primary">Try Again</a>` : ''}
//           <a href="/" class="btn btn-secondary">Back to Dashboard</a>
//         </div>
//       </div>
//     </body>
//     </html>
//   `;

//   res.setHeader('Content-Type', 'text/html');
//   res.send(html);
// };

// // ============================================
// // SUBSCRIPTION MANAGEMENT
// // ============================================

// exports.checkRenewals = async (req, res) => {
//   try {
//     const result = await invoicePaymentService.checkRenewals(pool);

//     logger.info('POST', '/api/subscriptions/check-renewals', 200);
//     return successResponse(res, result, 'Renewal check completed successfully');
//   } catch (error) {
//     logger.error('Check renewals error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// exports.getActiveSubscriptions = async (req, res) => {
//   try {
//     const { company_id } = req.query;

//     const result = await invoicePaymentService.getActiveSubscriptions(pool, company_id);

//     logger.info('GET', '/api/subscriptions/active', 200);
//     return successResponse(res, result, 'Active subscriptions retrieved successfully');
//   } catch (error) {
//     logger.error('Get active subscriptions error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// // ============================================
// // OVERDUE HANDLING
// // ============================================

// exports.handleOverdue = async (req, res) => {
//   try {
//     const result = await invoicePaymentService.handleOverdueInvoices(pool);

//     logger.info('POST', '/api/invoices/handle-overdue', 200);
//     return successResponse(res, result, 'Overdue invoices handled successfully');
//   } catch (error) {
//     logger.error('Handle overdue error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// // ============================================
// // ACCOUNTING SYNC
// // ============================================

// exports.syncAccounting = async (req, res) => {
//   try {
//     const { invoice_id } = req.params;
//     const { accounting_system } = req.body;

//     if (!accounting_system) {
//       return errorResponse(res, 'accounting_system is required', 400);
//     }

//     const result = await invoicePaymentService.syncInvoiceToAccounting(
//       pool,
//       invoice_id,
//       accounting_system
//     );

//     logger.info('POST', `/api/invoices/${invoice_id}/sync-accounting`, 200);
//     return successResponse(res, result, 'Invoice synced to accounting system successfully');
//   } catch (error) {
//     logger.error('Sync accounting error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// // ============================================
// // ADDITIONAL ENDPOINTS
// // ============================================

// exports.getRevenueDashboard = async (req, res) => {
//   try {
//     const { company_id, start_date, end_date } = req.query;

//     const result = await invoicePaymentService.getRevenueDashboard(
//       pool,
//       company_id,
//       start_date,
//       end_date
//     );

//     logger.info('GET', '/api/invoices/revenue-dashboard', 200);
//     return successResponse(res, result, 'Revenue dashboard retrieved successfully');
//   } catch (error) {
//     logger.error('Get revenue dashboard error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// exports.getOverdueReport = async (req, res) => {
//   try {
//     const { company_id } = req.query;

//     const result = await invoicePaymentService.getOverdueInvoicesReport(pool, company_id);

//     logger.info('GET', '/api/invoices/overdue-report', 200);
//     return successResponse(res, result, 'Overdue report retrieved successfully');
//   } catch (error) {
//     logger.error('Get overdue report error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// exports.recordPartialPayment = async (req, res) => {
//   try {
//     const { invoice_id } = req.params;
//     const { amount, payment_method } = req.body;

//     if (!amount || !payment_method) {
//       return errorResponse(res, 'amount and payment_method are required', 400);
//     }

//     const result = await invoicePaymentService.recordPartialPayment(
//       pool,
//       invoice_id,
//       amount,
//       payment_method
//     );

//     logger.info('POST', `/api/invoices/${invoice_id}/partial-payment`, 200);
//     return successResponse(res, result, 'Partial payment recorded successfully');
//   } catch (error) {
//     logger.error('Record partial payment error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// exports.processRefund = async (req, res) => {
//   try {
//     const { invoice_id } = req.params;
//     const { refund_amount, reason } = req.body;

//     if (!refund_amount || !reason) {
//       return errorResponse(res, 'refund_amount and reason are required', 400);
//     }

//     const result = await invoicePaymentService.processRefund(
//       pool,
//       invoice_id,
//       refund_amount,
//       reason
//     );

//     logger.info('POST', `/api/invoices/${invoice_id}/refund`, 200);
//     return successResponse(res, result, 'Refund processed successfully');
//   } catch (error) {
//     logger.error('Process refund error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// module.exports = exports;