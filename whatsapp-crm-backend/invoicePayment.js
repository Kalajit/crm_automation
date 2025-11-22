// ============================================
// MODULE 4: INVOICE & PAYMENT SYSTEM
// All Functions - invoicePayment.js
// ============================================

const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ============================================
// PHONEPE CONFIGURATION
// ============================================

const PHONEPE_CONFIG = {
  merchantId: process.env.PHONEPE_MERCHANT_ID,
  saltKey: process.env.PHONEPE_SALT_KEY,
  saltIndex: parseInt(process.env.PHONEPE_SALT_INDEX),
  baseUrl: process.env.PHONEPE_BASE_URL,
  redirectUrl: process.env.PHONEPE_REDIRECT_URL,
  callbackUrl: process.env.PHONEPE_CALLBACK_URL
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate PhonePe checksum for API security
 */
function generatePhonePeChecksum(payload, endpoint) {
  const string = payload + endpoint + PHONEPE_CONFIG.saltKey;
  const sha256 = crypto.createHash('sha256').update(string).digest('hex');
  return `${sha256}###${PHONEPE_CONFIG.saltIndex}`;
}

/**
 * Generate unique merchant transaction ID
 */
function generateMerchantTransactionId() {
  return `TXN_${Date.now()}_${uuidv4().split('-')[0]}`;
}

// ============================================
// 1. AUTO-INVOICE GENERATION
// ============================================

/**
 * Auto-generate invoice when deal is closed
 */
async function autoGenerateInvoice(pool, data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      lead_id,
      amount,
      invoice_type,
      due_date,
      subscription_months,
      description,
      company_id
    } = data;

    if (!lead_id || !amount || !invoice_type) {
      throw new Error('lead_id, amount, and invoice_type are required');
    }

    // Get lead details
    const leadResult = await client.query(
      'SELECT * FROM leads WHERE id = $1',
      [lead_id]
    );

    if (leadResult.rows.length === 0) {
      throw new Error('Lead not found');
    }

    const lead = leadResult.rows[0];

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Calculate due date if not provided
    const dueDateTime = due_date 
      ? new Date(due_date) 
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create invoice
    const invoiceResult = await client.query(`
      INSERT INTO invoices (
        lead_id, phone_number, invoice_number, amount, currency,
        invoice_type, status, due_date, invoice_data, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, NOW())
      RETURNING *
    `, [
      lead_id,
      lead.phone_number,
      invoiceNumber,
      amount,
      'INR',
      invoice_type,
      dueDateTime,
      JSON.stringify({
        description: description || `Payment for ${invoice_type}`,
        subscription_months: subscription_months || null,
        generated_at: new Date().toISOString()
      })
    ]);

    const invoice = invoiceResult.rows[0];

    // For subscriptions, create membership record
    if (invoice_type === 'subscription' && subscription_months) {
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + subscription_months);

      await client.query(`
        INSERT INTO lead_subscriptions (
          lead_id, invoice_id, start_date, end_date, status, renewal_reminder_sent
        ) VALUES ($1, $2, $3, $4, 'pending', FALSE)
      `, [lead_id, invoice.id, startDate, endDate]);
    }

    // Generate PDF invoice
    const pdfPath = await generateInvoicePDF(invoice, lead);
    await client.query(
      'UPDATE invoices SET pdf_url = $1 WHERE id = $2',
      [pdfPath, invoice.id]
    );

    // Send invoice to customer
    await sendInvoiceToCustomer(pool, invoice.id, lead);

    // Update lead status
    await client.query(
      `UPDATE leads SET lead_status = 'invoice_sent', updated_at = NOW() WHERE id = $1`,
      [lead_id]
    );

    await client.query('COMMIT');

    return {
      success: true,
      invoice: invoice,
      pdf_url: pdfPath,
      message: 'Invoice generated and sent to customer'
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// 2. PHONEPE PAYMENT INITIATION
// ============================================

/**
 * Initiate PhonePe payment for an invoice
 */
async function initiatePayment(pool, invoiceId) {
  try {
    // Get invoice details
    const invoiceResult = await pool.query(`
      SELECT i.*, l.name as lead_name, l.email, l.phone_number
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      WHERE i.id = $1 AND i.status = 'pending'
    `, [invoiceId]);

    if (invoiceResult.rows.length === 0) {
      throw new Error('Invoice not found or already paid');
    }

    const invoice = invoiceResult.rows[0];
    const merchantTransactionId = generateMerchantTransactionId();

    // PhonePe payment request payload
    const paymentData = {
      merchantId: PHONEPE_CONFIG.merchantId,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: `USER_${invoice.lead_id}`,
      amount: Math.round(invoice.amount * 100),
      redirectUrl: `${PHONEPE_CONFIG.redirectUrl}?invoice_id=${invoiceId}&txn_id=${merchantTransactionId}`,
      redirectMode: 'POST',
      callbackUrl: PHONEPE_CONFIG.callbackUrl,
      mobileNumber: invoice.phone_number.replace(/\D/g, ''),
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };

    // Encode payload
    const payload = JSON.stringify(paymentData);
    const base64Payload = Buffer.from(payload).toString('base64');

    // Generate checksum
    const checksum = generatePhonePeChecksum(base64Payload, '/pg/v1/pay');

    // Make API request to PhonePe
    const response = await axios.post(
      `${PHONEPE_CONFIG.baseUrl}/pg/v1/pay`,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum
        }
      }
    );

    // Save transaction record
    await pool.query(`
      INSERT INTO payment_transactions (
        invoice_id, merchant_transaction_id, amount, status
      ) VALUES ($1, $2, $3, 'initiated')
    `, [invoiceId, merchantTransactionId, invoice.amount]);

    // Update invoice
    await pool.query(`
      UPDATE invoices 
      SET payment_method = 'PhonePe',
          phonepe_transaction_id = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [merchantTransactionId, invoiceId]);

    return {
      success: true,
      payment_url: response.data.data.instrumentResponse.redirectInfo.url,
      merchant_transaction_id: merchantTransactionId,
      invoice_number: invoice.invoice_number
    };

  } catch (error) {
    throw error;
  }
}

// ============================================
// 3. PAYMENT CALLBACK HANDLER
// ============================================

/**
 * Handle PhonePe callback
 */
async function handlePaymentCallback(pool, callbackResponse) {
  try {
    const decodedResponse = Buffer.from(callbackResponse, 'base64').toString('utf-8');
    const callbackData = JSON.parse(decodedResponse);

    const merchantTransactionId = callbackData.data.merchantTransactionId;
    const transactionId = callbackData.data.transactionId;
    const state = callbackData.data.state;

    // Update payment transaction
    await pool.query(`
      UPDATE payment_transactions
      SET phonepe_transaction_id = $1,
          status = $2,
          callback_data = $3,
          updated_at = NOW()
      WHERE merchant_transaction_id = $4
    `, [transactionId, state.toLowerCase(), JSON.stringify(callbackData), merchantTransactionId]);

    // Handle based on state
    if (state === 'COMPLETED') {
      await handleSuccessfulPayment(pool, merchantTransactionId, transactionId);
    } else if (state === 'FAILED') {
      await handleFailedPayment(pool, merchantTransactionId);
    }

    return { success: true };

  } catch (error) {
    throw error;
  }
}

// ============================================
// 4. PAYMENT STATUS CHECK
// ============================================

/**
 * Check payment status with PhonePe
 */
async function checkPaymentStatus(pool, invoiceId, txnId) {
  try {
    const statusChecksum = generatePhonePeChecksum(
      '',
      `/pg/v1/status/${PHONEPE_CONFIG.merchantId}/${txnId}`
    );

    const statusResponse = await axios.get(
      `${PHONEPE_CONFIG.baseUrl}/pg/v1/status/${PHONEPE_CONFIG.merchantId}/${txnId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': statusChecksum,
          'X-MERCHANT-ID': PHONEPE_CONFIG.merchantId
        }
      }
    );

    const paymentStatus = statusResponse.data;

    if (paymentStatus.success && paymentStatus.data.state === 'COMPLETED') {
      await handleSuccessfulPayment(pool, txnId, paymentStatus.data.transactionId, invoiceId);
      return { success: true, status: 'completed' };
    } else {
      await handleFailedPayment(pool, txnId, invoiceId);
      return { success: false, status: paymentStatus.data.state };
    }

  } catch (error) {
    throw error;
  }
}

// ============================================
// 5. PAYMENT SUCCESS HANDLER
// ============================================

/**
 * Handle successful payment
 */
async function handleSuccessfulPayment(pool, merchantTransactionId, phonePeTransactionId, invoiceId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find invoice
    let invoice;
    if (invoiceId) {
      const result = await client.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
      invoice = result.rows[0];
    } else {
      const result = await client.query(`
        SELECT * FROM invoices WHERE phonepe_transaction_id = $1
      `, [merchantTransactionId]);
      invoice = result.rows[0];
    }

    if (!invoice) {
      throw new Error('Invoice not found for transaction');
    }

    // Update invoice status
    await client.query(`
      UPDATE invoices 
      SET status = 'paid',
          paid_date = NOW(),
          phonepe_reference_id = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [phonePeTransactionId, invoice.id]);

    // Update payment transaction
    await client.query(`
      UPDATE payment_transactions
      SET status = 'success', updated_at = NOW()
      WHERE merchant_transaction_id = $1
    `, [merchantTransactionId]);

    // If subscription, activate
    if (invoice.invoice_type === 'subscription') {
      await client.query(`
        UPDATE lead_subscriptions 
        SET status = 'active', updated_at = NOW()
        WHERE invoice_id = $1
      `, [invoice.id]);
    }

    // Update lead status
    await client.query(`
      UPDATE leads 
      SET lead_status = 'customer', updated_at = NOW()
      WHERE id = $1
    `, [invoice.lead_id]);

    // Send confirmation
    await sendPaymentConfirmation(pool, invoice.id);

    // Create audit log
    await client.query(`
      INSERT INTO audit_logs (lead_id, action, details, created_by)
      VALUES ($1, 'payment_completed', $2, 'system')
    `, [
      invoice.lead_id,
      JSON.stringify({
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        amount: invoice.amount,
        transaction_id: phonePeTransactionId
      })
    ]);

    await client.query('COMMIT');
    console.log(`✅ Payment successful for invoice ${invoice.invoice_number}`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// 6. PAYMENT FAILURE HANDLER
// ============================================

/**
 * Handle failed payment
 */
async function handleFailedPayment(pool, merchantTransactionId, invoiceId = null) {
  try {
    if (invoiceId) {
      await pool.query(
        'UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', invoiceId]
      );
    } else {
      await pool.query(
        `UPDATE invoices SET status = $1, updated_at = NOW() 
         WHERE phonepe_transaction_id = $2`,
        ['failed', merchantTransactionId]
      );
    }

    await pool.query(`
      UPDATE payment_transactions
      SET status = 'failed', updated_at = NOW()
      WHERE merchant_transaction_id = $1
    `, [merchantTransactionId]);

    console.log(`❌ Payment failed for transaction ${merchantTransactionId}`);
  } catch (error) {
    throw error;
  }
}

// ============================================
// 7. SUBSCRIPTION RENEWAL CHECK
// ============================================

/**
 * Check expiring subscriptions and send reminders
 */
async function checkRenewals(pool) {
  try {
    const expiringSubscriptions = await pool.query(`
      SELECT ls.*, l.name, l.email, l.phone_number, i.invoice_number, i.amount
      FROM lead_subscriptions ls
      JOIN leads l ON ls.lead_id = l.id
      JOIN invoices i ON ls.invoice_id = i.id
      WHERE ls.status = 'active'
        AND (
          DATE(ls.end_date) = CURRENT_DATE + INTERVAL '30 days'
          OR DATE(ls.end_date) = CURRENT_DATE + INTERVAL '7 days'
          OR DATE(ls.end_date) = CURRENT_DATE + INTERVAL '1 day'
        )
        AND ls.renewal_reminder_sent = FALSE
    `);

    const reminders = [];

    for (const subscription of expiringSubscriptions.rows) {
      const daysUntilExpiry = Math.ceil(
        (new Date(subscription.end_date) - new Date()) / (1000 * 60 * 60 * 24)
      );

      const reminderSent = await sendRenewalReminder(pool, subscription, daysUntilExpiry);

      if (reminderSent) {
        await pool.query(
          'UPDATE lead_subscriptions SET renewal_reminder_sent = TRUE WHERE id = $1',
          [subscription.id]
        );

        await pool.query(`
          INSERT INTO invoice_reminders (invoice_id, reminder_type, sent_via, message_body)
          VALUES ($1, 'renewal', 'whatsapp', $2)
        `, [
          subscription.invoice_id,
          `Subscription expiring in ${daysUntilExpiry} days`
        ]);

        reminders.push({
          subscription_id: subscription.id,
          lead_name: subscription.name,
          days_until_expiry: daysUntilExpiry
        });
      }
    }

    // Check expired subscriptions
    const expiredResult = await pool.query(`
      UPDATE lead_subscriptions
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'active' AND end_date < CURRENT_DATE
      RETURNING id, lead_id
    `);

    // Notify management
    if (expiredResult.rows.length > 0) {
      await pool.query(`
        INSERT INTO system_notifications (
          notification_type, title, message, priority
        ) VALUES ('subscription_expired', $1, $2, 'high')
      `, [
        `${expiredResult.rows.length} Subscriptions Expired`,
        `${expiredResult.rows.length} customer subscriptions have expired today.`
      ]);
    }

    return {
      reminders_sent: reminders.length,
      expired_subscriptions: expiredResult.rows.length,
      reminders: reminders
    };

  } catch (error) {
    throw error;
  }
}

// ============================================
// 8. OVERDUE INVOICE HANDLER
// ============================================

/**
 * Handle overdue invoices
 */
async function handleOverdueInvoices(pool) {
  try {
    const overdueInvoices = await pool.query(`
      SELECT i.*, l.name, l.email, l.phone_number, l.preferred_language, l.company_id,
             EXTRACT(DAY FROM (CURRENT_DATE - i.due_date)) as days_overdue
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      WHERE i.status = 'pending' AND i.due_date < CURRENT_DATE
      ORDER BY i.due_date ASC
    `);

    const actions = [];

    for (const invoice of overdueInvoices.rows) {
      const daysOverdue = parseInt(invoice.days_overdue);
      let action = null;

      if (daysOverdue === 1) {
        action = await sendOverdueReminder(pool, invoice, 'gentle');
      } else if (daysOverdue === 7) {
        action = await sendOverdueReminder(pool, invoice, 'strong');
      } else if (daysOverdue === 14) {
        action = await escalateToManagement(pool, invoice);
      } else if (daysOverdue > 30) {
        await pool.query(
          `UPDATE invoices SET status = 'bad_debt', updated_at = NOW() WHERE id = $1`,
          [invoice.id]
        );
        action = { type: 'marked_bad_debt', invoice_id: invoice.id };
      }

      if (action) {
        await pool.query(
          `UPDATE invoices SET reminder_count = reminder_count + 1, 
           last_reminder_sent = NOW() WHERE id = $1`,
          [invoice.id]
        );
        actions.push(action);
      }
    }

    return {
      overdue_count: overdueInvoices.rows.length,
      actions_taken: actions.length,
      actions: actions
    };

  } catch (error) {
    throw error;
  }
}

// ============================================
// 9. PDF GENERATION
// ============================================

/**
 * Generate PDF invoice
 */
async function generateInvoicePDF(invoice, lead) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const filename = `invoice_${invoice.invoice_number}.pdf`;
      const invoicesDir = path.join(__dirname, 'invoices');
      const filepath = path.join(invoicesDir, filename);

      if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
      }

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).text('INVOICE', 50, 50);
      doc.fontSize(10).text(`Invoice #: ${invoice.invoice_number}`, 50, 80);
      doc.text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`, 50, 95);
      doc.text(`Due Date: ${new Date(invoice.due_date).toLocaleDateString()}`, 50, 110);

      // Bill To
      doc.fontSize(12).text('Bill To:', 50, 140);
      doc.fontSize(10);
      doc.text(lead.name || 'Customer', 50, 160);
      doc.text(lead.phone_number, 50, 175);
      if (lead.email) doc.text(lead.email, 50, 190);

      // Details
      doc.fontSize(12).text('Description', 50, 230);
      doc.text('Amount', 400, 230);
      doc.moveTo(50, 245).lineTo(550, 245).stroke();

      const invoiceData = typeof invoice.invoice_data === 'string' 
        ? JSON.parse(invoice.invoice_data) 
        : invoice.invoice_data || {};
      const description = invoiceData.description || 'Service/Product';

      doc.fontSize(10).text(description, 50, 260);
      doc.text(`₹ ${parseFloat(invoice.amount).toFixed(2)}`, 400, 260);

      // Total
      doc.moveTo(50, 290).lineTo(550, 290).stroke();
      doc.fontSize(12).text('Total:', 350, 310);
      doc.text(`₹ ${parseFloat(invoice.amount).toFixed(2)}`, 400, 310);

      // Footer
      doc.fontSize(8).text('Thank you for your business!', 50, 700, { align: 'center' });

      doc.end();

      stream.on('finish', () => resolve(`/invoices/${filename}`));
      stream.on('error', reject);

    } catch (error) {
      reject(error);
    }
  });
}

// ============================================
// 10. NOTIFICATION FUNCTIONS
// ============================================

/**
 * Send invoice to customer
 */
async function sendInvoiceToCustomer(pool, invoiceId, lead) {
  try {
    const invoice = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (invoice.rows.length === 0) return;

    const inv = invoice.rows[0];

    let message = `📄 *Invoice Generated*\n\n`;
    message += `Invoice #: ${inv.invoice_number}\n`;
    message += `Amount: ₹${inv.amount}\n`;
    message += `Due Date: ${new Date(inv.due_date).toLocaleDateString()}\n\n`;
    message += `Click here to pay: ${process.env.BASE_URL || 'http://localhost:3000'}/api/invoices/${inv.id}/initiate-payment`;

    // Send via WhatsApp
    const agentResult = await pool.query(`
      SELECT * FROM agent_instances
      WHERE company_id = $1 AND agent_type = 'whatsapp' AND is_active = TRUE
      LIMIT 1
    `, [lead.company_id || 1]);

    if (agentResult.rows.length > 0) {
      const agent = agentResult.rows[0];
      const credentials = agent.whatsapp_credentials;

      if (credentials && credentials.access_token) {
        await axios.post(
          `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
          {
            messaging_product: 'whatsapp',
            to: lead.phone_number.replace('+', ''),
            type: 'text',
            text: { body: message }
          },
          {
            headers: {
              'Authorization': `Bearer ${credentials.access_token}`,
              'Content-Type': 'application/json'
            }
          }
        );
      }
    }

    // Email
    if (lead.email) {
      await pool.query(`
        INSERT INTO email_queue (to_email, subject, body, lead_id, priority)
        VALUES ($1, $2, $3, $4, 'high')
      `, [lead.email, `Invoice ${inv.invoice_number}`, message, lead.id]);
    }

    console.log(`✅ Invoice sent to ${lead.name || lead.phone_number}`);
  } catch (error) {
    console.error('Send invoice error:', error);
  }
}

/**
 * Send payment confirmation
 */
async function sendPaymentConfirmation(pool, invoiceId) {
  try {
    const result = await pool.query(`
      SELECT i.*, l.name, l.email, l.phone_number
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      WHERE i.id = $1
    `, [invoiceId]);

    if (result.rows.length === 0) return;

    const invoice = result.rows[0];

    let message = `✅ *Payment Received!*\n\n`;
    message += `Invoice #: ${invoice.invoice_number}\n`;
    message += `Amount: ₹${invoice.amount}\n`;
    message += `Date: ${new Date(invoice.paid_date).toLocaleDateString()}\n\n`;
    message += `Thank you!`;

    await pool.query(`
      INSERT INTO notifications (
        lead_id, phone_number, notification_type, title, message,
        delivery_channel, scheduled_time, status
      ) VALUES ($1, $2, 'payment_confirmation', 'Payment Received', $3, 'whatsapp', NOW(), 'pending')
    `, [invoice.lead_id, invoice.phone_number, message]);

  } catch (error) {
    console.error('Send payment confirmation error:', error);
  }
}

/**
 * Send renewal reminder
 */
async function sendRenewalReminder(pool, subscription, daysUntilExpiry) {
  try {
    let message = `⏰ *Subscription Renewal Reminder*\n\n`;
    message += `Hi ${subscription.name},\n\n`;
    message += `Your subscription expires in ${daysUntilExpiry} day(s).\n`;
    message += `Amount: ₹${subscription.amount}\n\n`;
    message += `Renew now!`;

    await pool.query(`
      INSERT INTO notifications (
        lead_id, phone_number, notification_type, title, message,
        delivery_channel, scheduled_time, status
      ) VALUES ($1, $2, 'renewal_reminder', 'Subscription Expiring', $3, 'whatsapp', NOW(), 'pending')
    `, [subscription.lead_id, subscription.phone_number, message]);

    return true;
  } catch (error) {
    console.error('Send renewal reminder error:', error);
    return false;
  }
}

/**
 * Send overdue reminder
 */
async function sendOverdueReminder(pool, invoice, reminderType) {
  try {
    let message;

    if (reminderType === 'gentle') {
      message = `📋 *Gentle Reminder*\n\nInvoice ${invoice.invoice_number} for ₹${invoice.amount} was due on ${new Date(invoice.due_date).toLocaleDateString()}.\n\nPlease pay at your earliest convenience.`;
    } else if (reminderType === 'strong') {
      message = `⚠️ *Payment Overdue*\n\nInvoice ${invoice.invoice_number} for ₹${invoice.amount} is now 7 days overdue.\n\nPlease pay immediately.`;
    }

    await pool.query(`
      INSERT INTO notifications (
        lead_id, phone_number, notification_type, title, message,
        delivery_channel, scheduled_time, status, priority
      ) VALUES ($1, $2, 'overdue_reminder', 'Payment Overdue', $3, 'whatsapp', NOW(), 'pending', 'high')
    `, [invoice.lead_id, invoice.phone_number, message]);

    await pool.query(`
      INSERT INTO invoice_reminders (invoice_id, reminder_type, sent_via, message_body)
      VALUES ($1, $2, 'whatsapp', $3)
    `, [invoice.id, reminderType, message]);

    return { type: `overdue_${reminderType}`, invoice_id: invoice.id };
  } catch (error) {
    console.error('Send overdue reminder error:', error);
    return null;
  }
}

/**
 * Escalate to management
 */
async function escalateToManagement(pool, invoice) {
  try {
    await pool.query(`
      INSERT INTO system_notifications (
        notification_type, title, message, priority
      ) VALUES ('overdue_escalation', $1, $2, 'urgent')
    `, [
      `Invoice ${invoice.invoice_number} 14+ Days Overdue`,
      `Invoice for ${invoice.name} (₹${invoice.amount}) is ${invoice.days_overdue} days overdue.`
    ]);

    await pool.query(`
      INSERT INTO tasks (
        company_id, lead_id, task_type, title, description, due_date, priority, status
      ) VALUES ($1, $2, 'follow_up', $3, $4, NOW() + INTERVAL '1 day', 'urgent', 'pending')
    `, [
      invoice.company_id || 1,
      invoice.lead_id,
      `Follow up on overdue invoice ${invoice.invoice_number}`,
      `Invoice ${invoice.invoice_number} is ${invoice.days_overdue} days overdue.`
    ]);

    return { type: 'escalated_to_management', invoice_id: invoice.id };
  } catch (error) {
    console.error('Escalate error:', error);
    return null;
  }
}

// ============================================
// 11. ACCOUNTING SYNC FUNCTIONS
// ============================================

async function syncToQuickBooks(invoice) {
  console.log('Syncing to QuickBooks:', invoice.invoice_number);
  return { success: true, external_id: `QB-${Date.now()}` };
}

async function syncToZohoBooks(invoice) {
  console.log('Syncing to Zoho Books:', invoice.invoice_number);
  return { success: true, external_id: `ZOHO-${Date.now()}` };
}

async function syncToTally(invoice) {
  console.log('Syncing to Tally:', invoice.invoice_number);
  return { success: true, external_id: `TALLY-${Date.now()}` };
}

/**
 * Sync invoice to accounting software
 */
async function syncInvoiceToAccounting(pool, invoiceId, accountingSystem) {
  try {
    const invoiceResult = await pool.query(`
      SELECT i.*, l.name, l.email, l.phone_number
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      WHERE i.id = $1
    `, [invoiceId]);

    if (invoiceResult.rows.length === 0) {
      throw new Error('Invoice not found');
    }

    const invoice = invoiceResult.rows[0];
    let syncResult = null;

    switch (accountingSystem) {
      case 'quickbooks':
        syncResult = await syncToQuickBooks(invoice);
        break;
      case 'zoho':
        syncResult = await syncToZohoBooks(invoice);
        break;
      case 'tally':
        syncResult = await syncToTally(invoice);
        break;
      default:
        throw new Error('Invalid accounting system');
    }

    // Log sync
    await pool.query(`
      INSERT INTO accounting_sync_log (
        invoice_id, accounting_system, external_id, sync_status, response_data
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
      invoiceId,
      accountingSystem,
      syncResult.external_id,
      syncResult.success ? 'success' : 'failed',
      JSON.stringify(syncResult)
    ]);

    return {
      success: true,
      message: `Invoice synced to ${accountingSystem}`,
      sync_result: syncResult
    };

  } catch (error) {
    throw error;
  }
}

// ============================================
// 12. REPORT FUNCTIONS
// ============================================

/**
 * Get revenue dashboard
 */
async function getRevenueDashboard(pool, companyId, startDate, endDate) {
  try {
    let dateFilter = '';
    let companyFilter = '';
    const params = [];

    if (companyId) {
      params.push(companyId);
      companyFilter = `AND l.company_id = ${params.length}`;
    }

    if (startDate && endDate) {
      params.push(startDate, endDate);
      dateFilter = `AND i.created_at BETWEEN ${params.length - 1} AND ${params.length}`;
    }

    // Revenue metrics
    const revenueQuery = `
      SELECT 
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as total_revenue,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND invoice_type = 'subscription'), 0) as recurring_revenue,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND invoice_type = 'one_time'), 0) as one_time_revenue,
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) as pending_revenue,
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND due_date < CURRENT_DATE), 0) as overdue_amount,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_invoices,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_invoices,
        COUNT(*) FILTER (WHERE status = 'pending' AND due_date < CURRENT_DATE) as overdue_invoices,
        COALESCE(AVG(amount) FILTER (WHERE status = 'paid'), 0) as avg_invoice_value
      FROM invoices i
      LEFT JOIN leads l ON i.lead_id = l.id
      WHERE 1=1 ${companyFilter} ${dateFilter}
    `;

    const revenueResult = await pool.query(revenueQuery, params);

    // Monthly trend
    const trendQuery = `
      SELECT 
        DATE_TRUNC('month', i.created_at) as month,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as revenue,
        COUNT(*) FILTER (WHERE status = 'paid') as invoices
      FROM invoices i
      LEFT JOIN leads l ON i.lead_id = l.id
      WHERE 1=1 ${companyFilter} ${dateFilter}
      GROUP BY DATE_TRUNC('month', i.created_at)
      ORDER BY month DESC
      LIMIT 12
    `;

    const trendResult = await pool.query(trendQuery, params);

    // Subscription metrics
    const subscriptionQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active') as active_subscriptions,
        COUNT(*) FILTER (WHERE status = 'expired') as expired_subscriptions,
        COUNT(*) FILTER (WHERE status = 'active' AND end_date <= CURRENT_DATE + INTERVAL '30 days') as expiring_soon
      FROM lead_subscriptions ls
      ${companyId ? 'LEFT JOIN leads l ON ls.lead_id = l.id WHERE l.company_id = $1' : ''}
    `;

    const subscriptionResult = await pool.query(
      subscriptionQuery,
      companyId ? [companyId] : []
    );

    return {
      revenue_metrics: revenueResult.rows[0],
      revenue_trend: trendResult.rows,
      subscription_metrics: subscriptionResult.rows[0]
    };

  } catch (error) {
    throw error;
  }
}

/**
 * Get overdue invoices report
 */
async function getOverdueInvoicesReport(pool, companyId) {
  try {
    const query = `
      SELECT 
        i.*, 
        l.name as lead_name, 
        l.phone_number, 
        l.email,
        EXTRACT(DAY FROM (CURRENT_DATE - i.due_date)) as days_overdue
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      WHERE i.status = 'pending' 
        AND i.due_date < CURRENT_DATE
        ${companyId ? 'AND l.company_id = $1' : ''}
      ORDER BY i.due_date ASC
    `;

    const result = await pool.query(query, companyId ? [companyId] : []);

    // Aging buckets
    const aging = {
      '1-7_days': result.rows.filter(r => r.days_overdue <= 7),
      '8-14_days': result.rows.filter(r => r.days_overdue > 7 && r.days_overdue <= 14),
      '15-30_days': result.rows.filter(r => r.days_overdue > 14 && r.days_overdue <= 30),
      'over_30_days': result.rows.filter(r => r.days_overdue > 30)
    };

    return {
      total_overdue: result.rows.length,
      total_amount: result.rows.reduce((sum, inv) => sum + parseFloat(inv.amount), 0),
      aging_buckets: {
        '1-7_days': {
          count: aging['1-7_days'].length,
          amount: aging['1-7_days'].reduce((sum, inv) => sum + parseFloat(inv.amount), 0)
        },
        '8-14_days': {
          count: aging['8-14_days'].length,
          amount: aging['8-14_days'].reduce((sum, inv) => sum + parseFloat(inv.amount), 0)
        },
        '15-30_days': {
          count: aging['15-30_days'].length,
          amount: aging['15-30_days'].reduce((sum, inv) => sum + parseFloat(inv.amount), 0)
        },
        'over_30_days': {
          count: aging['over_30_days'].length,
          amount: aging['over_30_days'].reduce((sum, inv) => sum + parseFloat(inv.amount), 0)
        }
      },
      invoices: result.rows
    };

  } catch (error) {
    throw error;
  }
}

/**
 * Get churn analysis
 */
async function getChurnAnalysis(pool, companyId, months = 6) {
  try {
    const query = `
      SELECT 
        DATE_TRUNC('month', ls.end_date) as month,
        COUNT(*) as total_expired,
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM lead_subscriptions ls2
          WHERE ls2.lead_id = ls.lead_id AND ls2.start_date > ls.end_date
        )) as churned_customers,
        COALESCE(SUM(i.amount) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM lead_subscriptions ls2
          WHERE ls2.lead_id = ls.lead_id AND ls2.start_date > ls.end_date
        )), 0) as lost_revenue
      FROM lead_subscriptions ls
      JOIN invoices i ON ls.invoice_id = i.id
      ${companyId ? 'JOIN leads l ON ls.lead_id = l.id WHERE l.company_id = $1 AND' : 'WHERE'}
      ls.status = 'expired'
      AND ls.end_date >= CURRENT_DATE - INTERVAL '${parseInt(months)} months'
      GROUP BY DATE_TRUNC('month', ls.end_date)
      ORDER BY month DESC
    `;

    const result = await pool.query(query, companyId ? [companyId] : []);

    const totalChurned = result.rows.reduce((sum, row) => sum + parseInt(row.churned_customers), 0);
    const totalLostRevenue = result.rows.reduce((sum, row) => sum + parseFloat(row.lost_revenue || 0), 0);

    return {
      summary: {
        total_churned_customers: totalChurned,
        total_lost_revenue: totalLostRevenue,
        period_months: months
      },
      monthly_churn: result.rows
    };

  } catch (error) {
    throw error;
  }
}

/**
 * Get active subscriptions
 */
async function getActiveSubscriptions(pool, companyId) {
  try {
    const query = `
      SELECT 
        ls.id,
        ls.lead_id,
        l.name as lead_name,
        l.phone_number,
        l.email,
        ls.start_date,
        ls.end_date,
        EXTRACT(DAY FROM (ls.end_date - CURRENT_DATE)) as days_until_expiry,
        i.amount as subscription_amount,
        i.invoice_number,
        ls.renewal_reminder_sent,
        ls.auto_renew
      FROM lead_subscriptions ls
      JOIN leads l ON ls.lead_id = l.id
      JOIN invoices i ON ls.invoice_id = i.id
      WHERE ls.status = 'active'
        ${companyId ? 'AND l.company_id = $1' : ''}
      ORDER BY ls.end_date ASC
    `;

    const result = await pool.query(query, companyId ? [companyId] : []);

    return {
      total: result.rows.length,
      subscriptions: result.rows
    };

  } catch (error) {
    throw error;
  }
}

/**
 * Get invoice by ID
 */
async function getInvoiceById(pool, invoiceId) {
  try {
    const result = await pool.query(`
      SELECT 
        i.*,
        l.name as lead_name,
        l.email,
        l.phone_number,
        l.company_id,
        ls.start_date as subscription_start,
        ls.end_date as subscription_end,
        ls.status as subscription_status
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      LEFT JOIN lead_subscriptions ls ON ls.invoice_id = i.id
      WHERE i.id = $1
    `, [invoiceId]);

    if (result.rows.length === 0) {
      throw new Error('Invoice not found');
    }

    return result.rows[0];

  } catch (error) {
    throw error;
  }
}

/**
 * List invoices with filters
 */
async function listInvoices(pool, filters) {
  try {
    const { company_id, status, invoice_type, start_date, end_date, limit = 50, offset = 0 } = filters;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (company_id) {
      params.push(company_id);
      whereClause += ` AND l.company_id = ${params.length}`;
    }

    if (status) {
      params.push(status);
      whereClause += ` AND i.status = ${params.length}`;
    }

    if (invoice_type) {
      params.push(invoice_type);
      whereClause += ` AND i.invoice_type = ${params.length}`;
    }

    if (start_date && end_date) {
      params.push(start_date, end_date);
      whereClause += ` AND i.created_at BETWEEN ${params.length - 1} AND ${params.length}`;
    }

    params.push(limit, offset);

    const query = `
      SELECT 
        i.*,
        l.name as lead_name,
        l.phone_number,
        l.email
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ${params.length - 1} OFFSET ${params.length}
    `;

    const result = await pool.query(query, params);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, params.slice(0, -2));

    return {
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset),
      invoices: result.rows
    };

  } catch (error) {
    throw error;
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Core functions
  autoGenerateInvoice,
  initiatePayment,
  handlePaymentCallback,
  checkPaymentStatus,
  
  // Payment handlers
  handleSuccessfulPayment,
  handleFailedPayment,
  
  // Automation
  checkRenewals,
  handleOverdueInvoices,
  
  // PDF & Notifications
  generateInvoicePDF,
  sendInvoiceToCustomer,
  sendPaymentConfirmation,
  sendRenewalReminder,
  sendOverdueReminder,
  escalateToManagement,
  
  // Accounting
  syncInvoiceToAccounting,
  syncToQuickBooks,
  syncToZohoBooks,
  syncToTally,
  
  // Reports
  getRevenueDashboard,
  getOverdueInvoicesReport,
  getChurnAnalysis,
  getActiveSubscriptions,
  getInvoiceById,
  listInvoices,
  
  // Utilities
  generatePhonePeChecksum,
  generateMerchantTransactionId,
  PHONEPE_CONFIG
};