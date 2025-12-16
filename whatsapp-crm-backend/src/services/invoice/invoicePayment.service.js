const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { StandardCheckoutClient, Env, MetaInfo, StandardCheckoutPayRequest } = require('phonepe-pg-sdk-node');
const logger = require('../../utils/logger');

// PhonePe Configuration
const PHONEPECONFIG = {
  clientId: process.env.PHONEPE_CLIENT_ID,
  clientSecret: process.env.PHONEPE_CLIENT_SECRET,
  clientVersion: '1',
  env: process.env.PHONEPE_ENV,
  redirectUrl: process.env.PHONEPE_REDIRECT_URL,
  callbackUrl: process.env.PHONEPE_CALLBACK_URL,
  saltKey: process.env.PHONEPE_SALT_KEY,
  saltIndex: process.env.PHONEPE_SALT_INDEX
};

// Initialize PhonePe SDK
const phonePeClient = StandardCheckoutClient.getInstance(
  PHONEPECONFIG.clientId,
  PHONEPECONFIG.clientSecret,
  PHONEPECONFIG.clientVersion,
  PHONEPECONFIG.env
);

console.log('PhonePe SDK Configuration:', {
  clientId: PHONEPECONFIG.clientId,
  clientSecret: PHONEPECONFIG.clientSecret ? '****' : 'MISSING',
  clientVersion: PHONEPECONFIG.clientVersion,
  env: PHONEPECONFIG.env
});

// Generate PhonePe Checksum
function generatePhonePeChecksum(base64Payload, endpoint = '/pg/v2/pay') {
  const string = base64Payload + endpoint + PHONEPECONFIG.saltKey;
  const sha256 = crypto.createHash('sha256').update(string).digest('hex');
  return `${sha256}###${PHONEPECONFIG.saltIndex}`;
}

// Generate Merchant Transaction ID
function generateMerchantTransactionId() {
  return 'TXN-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
}

// Auto-generate invoice when deal is closed
exports.autoGenerateInvoice = async (pool, data) => {
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

    const leadResult = await client.query(
      'SELECT * FROM leads WHERE id = $1',
      [lead_id]
    );

    if (leadResult.rows.length === 0) {
      throw new Error('Lead not found');
    }

    const lead = leadResult.rows[0];
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const dueDateTime = due_date 
      ? new Date(due_date) 
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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

    const pdfPath = await generateInvoicePDF(invoice, lead);
    await client.query(
      'UPDATE invoices SET pdf_url = $1 WHERE id = $2',
      [pdfPath, invoice.id]
    );

    await sendInvoiceToCustomer(client, invoice.id, lead);

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
};

// Initiate PhonePe payment for an invoice
exports.initiatePayment = async (pool, invoiceId) => {
  try {
    const invoiceResult = await pool.query(
      `SELECT i.*, l.name as leadname, l.email, l.phone_number FROM invoices i JOIN leads l ON i.lead_id = l.id WHERE i.id = $1 AND i.status = 'pending'`,
      [invoiceId]
    );
    if (invoiceResult.rows.length === 0) throw new Error('Invoice not found or already paid');

    const invoice = invoiceResult.rows[0];
    const merchantOrderId = generateMerchantTransactionId();

    const rawPhoneNumber = invoice.phone_number || '';
    const cleanPhoneNumber = rawPhoneNumber.replace(/\D/g, '').replace(/^91/, '');

    const metaInfo = {
      udf1: invoice.leadname || '',
      udf2: invoice.email || ''
    };

    if (!invoice.amount) throw new Error('Invoice amount is missing');

    const amount = Math.round(parseFloat(invoice.amount) * 100);
    if (isNaN(amount) || amount <= 0) throw new Error('Invalid invoice amount');

    const redirectUrl = `${PHONEPECONFIG.redirectUrl}?invoice_id=${invoiceId}&orderId=${merchantOrderId}`;

    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId)
      .amount(amount)
      .redirectUrl(redirectUrl)
      .metaInfo(metaInfo)
      .build();

    const response = await phonePeClient.pay(request);

    if (!response || !response.redirectUrl) throw new Error('PhonePe payment initiation failed');
    
    await pool.query(
      `INSERT INTO payment_transactions (invoice_id, merchant_transaction_id, amount, status, created_at) VALUES ($1, $2, $3, $4, NOW())`,
      [invoiceId, merchantOrderId, invoice.amount, 'initiated']
    );
    await pool.query(
      `UPDATE invoices SET payment_method = 'PhonePe', phonepe_transaction_id = $1, updated_at = NOW() WHERE id = $2`,
      [merchantOrderId, invoiceId]
    );

    return {
      success: true,
      paymenturl: response.redirectUrl,
      merchanttransactionid: merchantOrderId,
      invoicenumber: invoice.invoicenumber,
      amount: invoice.amount
    };
  } catch (error) {
    logger.error('PhonePe Payment Error:', error.message, error.data || error.response?.data);
    throw new Error('Payment initiation failed: ' + error.message);
  }
};

// Handle Payment Callback from PhonePe
exports.handlePaymentCallback = async (pool, callbackResponse) => {
  try {
    if (!callbackResponse) throw new Error('Empty callback response');
    
    logger.info('Raw Callback Response:', callbackResponse);
    
    let callbackData;
    try {
      const decodedResponse = Buffer.from(callbackResponse, 'base64').toString('utf-8');
      logger.info('Decoded Callback:', decodedResponse);
      callbackData = JSON.parse(decodedResponse);
    } catch (parseError) {
      throw new Error('Invalid callback format: ' + parseError.message);
    }
    
    logger.info('Parsed Callback Data:', JSON.stringify(callbackData, null, 2));
    
    if (!callbackData.data && !callbackData.response) {
      throw new Error('Invalid callback structure - missing data/response');
    }

    const paymentData = callbackData.data || callbackData.response;
    
    const merchantTransactionId = paymentData.merchantTransactionId || paymentData.merchantOrderId;
    const transactionId = paymentData.transactionId || paymentData.providerReferenceId;
    const state = paymentData.state || paymentData.status;
    const paymentMode = paymentData.paymentMode || paymentData.payment_mode || paymentData.paymentInstrument?.type || '';

    logger.info('Extracted Callback Info:', {
      merchantTransactionId,
      transactionId,
      state,
      paymentMode
    });

    await pool.query(
      `UPDATE payment_transactions 
       SET phonepe_transaction_id = $1, 
           status = $2, 
           payment_mode = $3,
           callback_data = $4, 
           updated_at = NOW() 
       WHERE merchant_transaction_id = $5`,
      [transactionId, state.toLowerCase(), paymentMode, JSON.stringify(callbackData), merchantTransactionId]
    );
    
    if (state === 'COMPLETED' || state === 'SUCCESS') {
      await pool.query(
        `UPDATE invoices 
         SET phonepe_reference_id = $1, updated_at = NOW() 
         WHERE phonepe_transaction_id = $2`,
        [transactionId, merchantTransactionId]
      );
      
      await handleSuccessfulPayment(pool, merchantTransactionId, transactionId);
    } else if (state === 'FAILED') {
      await handleFailedPayment(pool, merchantTransactionId);
    }
    
    return { success: true, state, transactionId };
  } catch (error) {
    logger.error('Callback error:', error);
    throw new Error('Callback processing failed: ' + error.message);
  }
};

// Generate Invoice PDF
async function generateInvoicePDF(invoice, lead) {
  return new Promise((resolve, reject) => {
    let stream;
    try {
      const doc = new PDFDocument({ margin: 50 });
      const filename = `invoice_${invoice.invoice_number}.pdf`;
      const invoicesDir = path.join(__dirname, '../../../invoices');
      const filepath = path.join(invoicesDir, filename);

      if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
      }

      stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      doc.fontSize(20).text('INVOICE', 50, 50);
      doc.fontSize(10).text(`Invoice #: ${invoice.invoice_number}`, 50, 80);
      doc.text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`, 50, 95);
      doc.text(`Due Date: ${new Date(invoice.due_date).toLocaleDateString()}`, 50, 110);

      doc.fontSize(12).text('Bill To:', 50, 140);
      doc.fontSize(10);
      doc.text(lead.name || 'Customer', 50, 160);
      doc.text(lead.phone_number, 50, 175);
      if (lead.email) doc.text(lead.email, 50, 190);

      doc.fontSize(12).text('Description', 50, 230);
      doc.text('Amount', 400, 230);
      doc.moveTo(50, 245).lineTo(550, 245).stroke();

      const invoiceData = typeof invoice.invoice_data === 'string' 
        ? JSON.parse(invoice.invoice_data) 
        : invoice.invoice_data || {};
      const description = invoiceData.description || 'Service/Product';

      doc.fontSize(10).text(description, 50, 260);
      doc.text(`₹ ${parseFloat(invoice.amount).toFixed(2)}`, 400, 260);

      doc.moveTo(50, 290).lineTo(550, 290).stroke();
      doc.fontSize(12).text('Total:', 350, 310);
      doc.text(`₹ ${parseFloat(invoice.amount).toFixed(2)}`, 400, 310);

      doc.fontSize(8).text('Thank you for your business!', 50, 700, { align: 'center' });

      doc.end();

      stream.on('finish', () => resolve(`/invoices/${filename}`));
      stream.on('error', (err) => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        reject(err);
      });

    } catch (error) {
      if (stream) {
        stream.destroy();
      }
      reject(error);
    }
  });
}

// Send invoice to customer
async function sendInvoiceToCustomer(client, invoiceId, lead) {
  try {
    const invoice = await client.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (invoice.rows.length === 0) return;

    const inv = invoice.rows[0];

    let message = `📄 *Invoice Generated*\n\n`;
    message += `Invoice #: ${inv.invoice_number}\n`;
    message += `Amount: ₹${inv.amount}\n`;
    message += `Due Date: ${new Date(inv.due_date).toLocaleDateString()}\n\n`;
    message += `Click here to pay: ${process.env.BASE_URL || 'http://localhost:3000'}/api/invoices/${inv.id}/initiate-payment`;

    const agentResult = await client.query(`
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

    if (lead.email) {
      await client.query(`
        INSERT INTO email_queue (to_email, subject, body, lead_id, priority)
        VALUES ($1, $2, $3, $4, 'high')
      `, [lead.email, `Invoice ${inv.invoice_number}`, message, lead.id]);
    }

    logger.info(`✅ Invoice sent to ${lead.name || lead.phone_number}`);
  } catch (error) {
    logger.error('Send invoice error:', error);
  }
}



// Check payment status
exports.checkPaymentStatus = async (pool, invoiceId, merchantOrderId) => {
  try {
    const response = await phonePeClient.getOrderStatus(merchantOrderId);

    logger.info('PhonePe Complete Response:', JSON.stringify(response, null, 2));

    const isSuccess = response.state === 'COMPLETED';
    let referenceId = '';
    let paymentMode = '';

    if (response.payment_details && Array.isArray(response.payment_details) && response.payment_details.length > 0) {
      const completedPayment = response.payment_details.find(p => p.state === 'COMPLETED');
      if (completedPayment) {
        referenceId = completedPayment.transactionId || completedPayment.transaction_id || '';
        paymentMode = completedPayment.paymentMode || completedPayment.payment_mode || '';
        
        logger.info('Payment Details Found (snake_case):', {
          referenceId,
          paymentMode,
          fullPaymentDetails: completedPayment
        });
      }
    }

    if (!referenceId && response.paymentDetails && Array.isArray(response.paymentDetails)) {
      const completedPayment = response.paymentDetails.find(p => p.state === 'COMPLETED');
      if (completedPayment) {
        referenceId = completedPayment.transactionId || '';
        paymentMode = completedPayment.paymentMode || '';
        logger.info('Payment Details Found (camelCase):', { referenceId, paymentMode });
      }
    }

    if (!referenceId && response.transactionId) {
      referenceId = response.transactionId;
      logger.info('Found reference ID at root level:', referenceId);
    }
    
    if (!referenceId && response.order_id) {
      referenceId = response.order_id;
      logger.info('Using order_id as reference:', referenceId);
    }

    if (!referenceId) {
      referenceId = merchantOrderId;
      logger.info('Using merchantOrderId as fallback reference:', referenceId);
    }

    logger.info('Final Payment Status Check:', {
      state: response.state,
      referenceId,
      paymentMode,
      merchantOrderId,
      invoiceId,
      hasPaymentDetails: !!(response.payment_details || response.paymentDetails),
      paymentDetailsLength: (response.payment_details?.length || response.paymentDetails?.length || 0)
    });

    if (isSuccess) {
      logger.info('Payment success, processing with:', {
        merchantOrderId,
        referenceId,
        invoiceId,
        paymentMode
      });

      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');

        await client.query(
          `UPDATE invoices 
           SET phonepe_reference_id = $1, 
               status = 'paid',
               paid_date = NOW(),
               payment_method = 'PhonePe',
               updated_at = NOW() 
           WHERE id = $2`,
          [referenceId, invoiceId]
        );

        await client.query(
          `UPDATE payment_transactions 
           SET phonepe_transaction_id = $1, 
               payment_mode = $2,
               callback_data = $3,
               status = 'success',
               updated_at = NOW() 
           WHERE merchant_transaction_id = $4`,
          [referenceId, paymentMode, JSON.stringify(response), merchantOrderId]
        );

        await handleSuccessfulPayment(client, merchantOrderId, referenceId, invoiceId);

        await client.query('COMMIT');
        
        return { 
          success: true, 
          status: 'completed', 
          referenceId,
          paymentMode,
          data: response 
        };

      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Database transaction error:', err);
        throw err;
      } finally {
        client.release();
      }
    } 
    else if (response.state === 'FAILED') {
      await handleFailedPayment(pool, merchantOrderId, invoiceId);
      return { success: false, status: 'failed', data: response };
    }
    else {
      return { 
        success: false, 
        status: response.state.toLowerCase(), 
        message: `Payment is in ${response.state} state`,
        data: response 
      };
    }

  } catch (error) {
    logger.error('Status check error:', {
      message: error.message,
      stack: error.stack,
      merchantOrderId,
      invoiceId
    });
    throw error;
  }
};

// Handle successful payment
async function handleSuccessfulPayment(client, merchantOrderId, referenceId, invoiceId) {
  try {
    logger.info('Processing successful payment:', { merchantOrderId, referenceId, invoiceId });

    const invoiceResult = await client.query(
      `SELECT i.*, l.phone_number, l.email, l.name, l.company_id 
       FROM invoices i 
       JOIN leads l ON i.lead_id = l.id 
       WHERE i.id = $1`,
      [invoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      throw new Error('Invoice not found');
    }

    const invoice = invoiceResult.rows[0];

    await client.query(
      `INSERT INTO payment_records (invoice_id, transaction_id, reference_id, status, created_at)
       VALUES ($1, $2, $3, 'success', NOW())
       ON CONFLICT (transaction_id) DO NOTHING`,
      [invoiceId, merchantOrderId, referenceId]
    );

    if (invoice.invoice_type === 'subscription') {
      await activateSubscription(client, invoice);
    }

    await sendPaymentConfirmation(client, invoice, referenceId);

    await queueConfirmationEmail(client, invoice, referenceId);

    logger.info('Successful payment processing completed');
  } catch (error) {
    logger.error('Error in handleSuccessfulPayment:', error);
    throw error;
  }
}

// Activate subscription after payment
async function activateSubscription(client, invoice) {
  const duration = invoice.invoice_data?.subscription_months || 1;
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + duration);

  await client.query(
    `INSERT INTO lead_subscriptions (lead_id, invoice_id, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, 'active')
     ON CONFLICT (lead_id, invoice_id) 
     DO UPDATE SET status = 'active', start_date = $3, end_date = $4, updated_at = NOW()`,
    [invoice.lead_id, invoice.id, startDate, endDate]
  );
}

// Queue confirmation email
async function queueConfirmationEmail(client, invoice, referenceId) {
  if (!invoice.email) return;

  const emailBody = `
    <h2>Payment Confirmation</h2>
    <p>Dear ${invoice.name},</p>
    <p>Your payment has been successfully processed.</p>
    <ul>
      <li><strong>Invoice Number:</strong> ${invoice.invoice_number}</li>
      <li><strong>Amount:</strong> ₹${invoice.amount}</li>
      <li><strong>Reference ID:</strong> ${referenceId}</li>
      <li><strong>Payment Date:</strong> ${new Date().toLocaleString('en-IN')}</li>
    </ul>
    <p>Thank you for your business!</p>
  `;

  await client.query(
    `INSERT INTO email_queue (to_email, subject, body, lead_id, priority, status)
     VALUES ($1, $2, $3, $4, 'high', 'pending')`,
    [invoice.email, `Payment Confirmation - ${invoice.invoice_number}`, emailBody, invoice.lead_id]
  );
}

// Handle failed payment with retry logic
async function handleFailedPayment(pool, merchantOrderId, invoiceId) {
  try {
    logger.info('Processing failed payment:', { merchantOrderId, invoiceId });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const txnResult = await client.query(
        `SELECT retry_count FROM payment_transactions WHERE merchant_transaction_id = $1`,
        [merchantOrderId]
      );

      const retryCount = txnResult.rows[0]?.retry_count || 0;
      const maxRetries = 3;

      await client.query(
        `UPDATE invoices 
         SET status = 'pending',
             updated_at = NOW() 
         WHERE id = $1`,
        [invoiceId]
      );

      await client.query(
        `UPDATE payment_transactions 
         SET status = $1,
             retry_count = $2,
             updated_at = NOW() 
         WHERE merchant_transaction_id = $3`,
        [retryCount < maxRetries ? 'pending' : 'failed', retryCount + 1, merchantOrderId]
      );

      if (retryCount < maxRetries) {
        await schedulePaymentRetry(client, invoiceId, merchantOrderId, retryCount + 1);
      } else {
        await sendPaymentFailureNotification(client, invoiceId);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    logger.info('Failed payment processing completed');
  } catch (error) {
    logger.error('Error in handleFailedPayment:', error);
    throw error;
  }
}

// Schedule payment retry
async function schedulePaymentRetry(client, invoiceId, merchantOrderId, retryNumber) {
  const retryDelayMinutes = [30, 120, 360][retryNumber - 1] || 360;
  const scheduledTime = new Date();
  scheduledTime.setMinutes(scheduledTime.getMinutes() + retryDelayMinutes);

  await client.query(
    `INSERT INTO notifications (
      lead_id, 
      phone_number, 
      notification_type, 
      title, 
      message, 
      status, 
      scheduled_time,
      delivery_channel
    )
    SELECT 
      i.lead_id,
      i.phone_number,
      'payment_retry',
      'Payment Reminder',
      'Your previous payment attempt failed. Please try again using the link: ' || i.pdf_url,
      'pending',
      $1,
      'whatsapp'
    FROM invoices i WHERE i.id = $2`,
    [scheduledTime, invoiceId]
  );
}

// Send payment failure notification
async function sendPaymentFailureNotification(client, invoiceId) {
  await client.query(
    `INSERT INTO notifications (
      lead_id, 
      phone_number, 
      notification_type, 
      title, 
      message, 
      status,
      delivery_channel
    )
    SELECT 
      i.lead_id,
      i.phone_number,
      'payment_failed',
      'Payment Failed',
      'Your payment for invoice ' || i.invoice_number || ' has failed after multiple attempts. Please contact support or try again.',
      'pending',
      'whatsapp'
    FROM invoices i WHERE i.id = $1`,
    [invoiceId]
  );
}

// Send payment confirmation via WhatsApp
async function sendPaymentConfirmation(client, invoice, referenceId) {
  const message = `✅ Payment Successful!

Invoice: ${invoice.invoice_number}
Amount: ₹${invoice.amount}
Reference: ${referenceId}

Thank you for your payment! Your subscription is now active.`;

  const agentResult = await client.query(
    `SELECT id FROM agent_instances 
     WHERE company_id = $1 AND agent_type = 'whatsapp' AND is_active = true 
     LIMIT 1`,
    [invoice.company_id]
  );

  if (agentResult.rows.length > 0) {
    await client.query(
      `INSERT INTO notifications (lead_id, phone_number, notification_type, title, message, status, delivery_channel)
       VALUES ($1, $2, 'payment_confirmation', 'Payment Successful', $3, 'pending', 'whatsapp')`,
      [invoice.lead_id, invoice.phone_number, message]
    );
  }
}


// Check expiring subscriptions and send reminders
exports.checkRenewals = async (pool) => {
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

    const expiredResult = await pool.query(`
      UPDATE lead_subscriptions
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'active' AND end_date < CURRENT_DATE
      RETURNING id, lead_id
    `);

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
};

// Handle overdue invoices
exports.handleOverdueInvoices = async (pool) => {
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
};

// Send renewal reminder
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
    logger.error('Send renewal reminder error:', error);
    return false;
  }
}

// Send overdue reminder
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
    logger.error('Send overdue reminder error:', error);
    return null;
  }
}

// Escalate to management
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
    logger.error('Escalate error:', error);
    return null;
  }
}


// Sync to QuickBooks
async function syncToQuickBooks(invoice) {
  logger.info('Syncing to QuickBooks:', invoice.invoice_number);
  return { success: true, external_id: `QB-${Date.now()}` };
}

// Sync to Zoho Books
async function syncToZohoBooks(invoice) {
  logger.info('Syncing to Zoho Books:', invoice.invoice_number);
  return { success: true, external_id: `ZOHO-${Date.now()}` };
}

// Sync to Tally
async function syncToTally(invoice) {
  logger.info('Syncing to Tally:', invoice.invoice_number);
  return { success: true, external_id: `TALLY-${Date.now()}` };
}

// Sync invoice to accounting software
exports.syncInvoiceToAccounting = async (pool, invoiceId, accountingSystem) => {
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
};

// Get revenue dashboard
exports.getRevenueDashboard = async (pool, companyId, startDate, endDate) => {
  try {
    const params = [];
    let companyFilter = '';
    let dateFilter = '';

    let revenueQuery = `
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
      WHERE 1=1
    `;

    if (companyId) {
      params.push(parseInt(companyId));
      companyFilter = ` AND l.company_id = $${params.length}`;
      revenueQuery += companyFilter;
    }

    if (startDate && endDate) {
      params.push(startDate, endDate);
      dateFilter = ` AND i.created_at BETWEEN $${params.length - 1}::date AND $${params.length}::date`;
      revenueQuery += dateFilter;
    }

    const revenueResult = await pool.query(revenueQuery, params);

    let trendQuery = `
      SELECT 
        DATE_TRUNC('month', i.created_at) as month,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as revenue,
        COUNT(*) FILTER (WHERE status = 'paid') as invoices
      FROM invoices i
      LEFT JOIN leads l ON i.lead_id = l.id
      WHERE 1=1
    `;

    if (companyId) {
      trendQuery += companyFilter;
    }
    if (startDate && endDate) {
      trendQuery += dateFilter;
    }

    trendQuery += ` GROUP BY DATE_TRUNC('month', i.created_at) ORDER BY month DESC LIMIT 12`;

    const trendResult = await pool.query(trendQuery, params);

    let subscriptionQuery = `
        SELECT 
            COUNT(*) FILTER (WHERE status = 'active') as active_subscriptions,
            COUNT(*) FILTER (WHERE status = 'expired') as expired_subscriptions,
            COUNT(*) FILTER (WHERE status = 'active' AND end_date <= CURRENT_DATE + INTERVAL '30 days') as expiring_soon
        FROM lead_subscriptions ls
        `;

    let subscriptionParams = [];
    if (companyId) {
      subscriptionParams.push(parseInt(companyId));
      subscriptionQuery += ` LEFT JOIN leads l ON ls.lead_id = l.id WHERE l.company_id = $1`;
    }

    const subscriptionResult = await pool.query(subscriptionQuery, subscriptionParams);

    return {
      revenue_metrics: revenueResult.rows[0],
      revenue_trend: trendResult.rows,
      subscription_metrics: subscriptionResult.rows[0]
    };

  } catch (error) {
    throw error;
  }
};

// Get overdue invoices report
exports.getOverdueInvoicesReport = async (pool, companyId) => {
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
};

// Get churn analysis
exports.getChurnAnalysis = async (pool, companyId, months = 6) => {
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
};

// Get active subscriptions
exports.getActiveSubscriptions = async (pool, companyId) => {
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
        EXTRACT(DAY FROM (ls.end_date::timestamp - CURRENT_DATE::timestamp)) as days_until_expiry,
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

    const result = await pool.query(query, companyId ? [parseInt(companyId)] : []);

    return {
      total: result.rows.length,
      subscriptions: result.rows
    };

  } catch (error) {
    throw error;
  }
};

// Get invoice by ID
exports.getInvoiceById = async (pool, invoiceId) => {
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
};

// List invoices with filters
exports.listInvoices = async (pool, filters) => {
  try {
    const { company_id, status, invoice_type, start_date, end_date, limit = 50, offset = 0 } = filters;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (company_id) {
      params.push(parseInt(company_id));
      whereClause += ` AND l.company_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      whereClause += ` AND i.status = $${params.length}`;
    }

    if (invoice_type) {
      params.push(invoice_type);
      whereClause += ` AND i.invoice_type = $${params.length}`;
    }

    if (start_date && end_date) {
      params.push(start_date, end_date);
      whereClause += ` AND i.created_at BETWEEN $${params.length - 1}::timestamp AND $${params.length}::timestamp`;
    }

    params.push(parseInt(limit), parseInt(offset));

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
      LIMIT $${params.length - 1} OFFSET $${params.length}
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
};


// Record partial payment
exports.recordPartialPayment = async (pool, invoiceId, amount, paymentMethod) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const invoice = await client.query(
      'SELECT amount, amount_paid FROM invoices WHERE id = $1 FOR UPDATE',
      [invoiceId]
    );
    
    if (invoice.rows.length === 0) {
      throw new Error('Invoice not found');
    }
    
    const totalAmount = parseFloat(invoice.rows[0].amount);
    const currentPaid = parseFloat(invoice.rows[0].amount_paid || 0);
    const newAmountPaid = currentPaid + parseFloat(amount);
    
    if (newAmountPaid > totalAmount) {
      throw new Error('Payment exceeds invoice amount');
    }
    
    await client.query(`
      UPDATE invoices 
      SET 
        amount_paid = $1,
        status = CASE 
          WHEN $1 >= amount THEN 'paid'
          ELSE 'partially_paid'
        END,
        updated_at = NOW()
      WHERE id = $2
    `, [newAmountPaid, invoiceId]);
    
    await client.query(`
      INSERT INTO payment_history (
        invoice_id, amount, payment_method, payment_date
      ) VALUES ($1, $2, $3, NOW())
    `, [invoiceId, amount, paymentMethod]);
    
    await client.query('COMMIT');
    
    return {
      success: true,
      amount_paid: newAmountPaid,
      remaining: totalAmount - newAmountPaid,
      status: newAmountPaid >= totalAmount ? 'paid' : 'partially_paid'
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Process refund
exports.processRefund = async (pool, invoiceId, refundAmount, reason) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invoiceResult = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND status = 'paid'`,
      [invoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      throw new Error('Invoice not found or not paid');
    }

    const invoice = invoiceResult.rows[0];

    if (refundAmount > invoice.amount) {
      throw new Error('Refund amount exceeds invoice amount');
    }

    await client.query(
      `INSERT INTO payment_transactions (
        invoice_id,
        merchant_transaction_id,
        phonepe_transaction_id,
        amount,
        status,
        payment_method,
        callback_data
      ) VALUES ($1, $2, $3, $4, 'refunded', 'PhonePe', $5)`,
      [
        invoiceId,
        `REFUND_${Date.now()}`,
        invoice.phonepe_reference_id,
        -refundAmount,
        JSON.stringify({ reason, refund_date: new Date() })
      ]
    );

    const isFullRefund = refundAmount >= invoice.amount;
    await client.query(
      `UPDATE invoices 
       SET status = $1,
           invoice_data = jsonb_set(
             COALESCE(invoice_data, '{}'::jsonb),
             '{refund}',
             $2::jsonb
           ),
           updated_at = NOW()
       WHERE id = $3`,
      [
        isFullRefund ? 'refunded' : 'partially_refunded',
        JSON.stringify({ amount: refundAmount, reason, date: new Date() }),
        invoiceId
      ]
    );

    if (isFullRefund && invoice.invoice_type === 'subscription') {
      await client.query(
        `UPDATE lead_subscriptions 
         SET status = 'cancelled', updated_at = NOW()
         WHERE invoice_id = $1`,
        [invoiceId]
      );
    }

    await client.query('COMMIT');

    return { success: true, refund_amount: refundAmount, is_full_refund: isFullRefund };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Retry failed payment
exports.retryFailedPayment = async (pool, invoiceId, maxRetries = 3) => {
  try {
    const invoice = await pool.query(
      `SELECT i.*, 
              COUNT(pt.id) as retry_count
       FROM invoices i
       LEFT JOIN payment_transactions pt ON i.id = pt.invoice_id
       WHERE i.id = $1 AND i.status = 'failed'
       GROUP BY i.id`,
      [invoiceId]
    );
    
    if (invoice.rows.length === 0) {
      throw new Error('Invoice not found or not in failed status');
    }
    
    const inv = invoice.rows[0];
    const retryCount = parseInt(inv.retry_count);
    
    if (retryCount >= maxRetries) {
      await pool.query(`
        UPDATE invoices 
        SET status = 'payment_retry_exhausted' 
        WHERE id = $1
      `, [invoiceId]);
      
      throw new Error('Maximum retry attempts exceeded');
    }
    
    await pool.query(`
      UPDATE invoices 
      SET status = 'pending', updated_at = NOW()
      WHERE id = $1
    `, [invoiceId]);
    
    const paymentResult = await exports.initiatePayment(pool, invoiceId);
    
    return {
      success: true,
      retry_count: retryCount + 1,
      payment_url: paymentResult.paymenturl
    };
    
  } catch (error) {
    throw error;
  }
};

// Process partial payment
exports.processPartialPayment = async (pool, invoiceId, paidAmount, referenceId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invoiceResult = await client.query(
      `SELECT * FROM invoices WHERE id = $1`,
      [invoiceId]
    );
    const invoice = invoiceResult.rows[0];

    if (!invoice) throw new Error('Invoice not found');

    const totalPaid = (invoice.invoice_data?.partial_payments_total || 0) + paidAmount;
    const remainingAmount = invoice.amount - totalPaid;

    const partialPayments = invoice.invoice_data?.partial_payments || [];
    partialPayments.push({
      amount: paidAmount,
      reference_id: referenceId,
      paid_at: new Date().toISOString()
    });

    await client.query(
      `UPDATE invoices 
       SET invoice_data = jsonb_set(
             jsonb_set(
               COALESCE(invoice_data, '{}'::jsonb),
               '{partial_payments}',
               $1::jsonb
             ),
             '{partial_payments_total}',
             $2::jsonb
           ),
           status = CASE WHEN $3 <= 0 THEN 'paid' ELSE 'partially_paid' END,
           paid_date = CASE WHEN $3 <= 0 THEN NOW() ELSE paid_date END,
           updated_at = NOW()
       WHERE id = $4`,
      [JSON.stringify(partialPayments), totalPaid, remainingAmount, invoiceId]
    );

    await client.query('COMMIT');

    return {
      success: true,
      total_paid: totalPaid,
      remaining: remainingAmount,
      fully_paid: remainingAmount <= 0
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Convert currency
exports.convertCurrency = async (amount, fromCurrency, toCurrency) => {
  const response = await axios.get(
    `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`
  );
  
  const rate = response.data.rates[toCurrency];
  return amount * rate;
};

// Create invoice with currency conversion
exports.createInvoiceWithCurrency = async (pool, invoiceData, currency = 'INR') => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let finalAmount = invoiceData.amount;
    if (currency !== 'INR') {
      finalAmount = await exports.convertCurrency(invoiceData.amount, currency, 'INR');
    }

    const result = await client.query(
      `INSERT INTO invoices (
        lead_id, phone_number, invoice_number, amount, currency, 
        invoice_type, status, due_date, invoice_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        invoiceData.lead_id,
        invoiceData.phone_number,
        invoiceData.invoice_number,
        finalAmount,
        currency,
        invoiceData.invoice_type,
        'pending',
        invoiceData.due_date,
        JSON.stringify({
          ...invoiceData.invoice_data,
          original_amount: invoiceData.amount,
          original_currency: currency,
          conversion_rate: finalAmount / invoiceData.amount
        })
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Calculate tax based on region
exports.calculateTax = (amount, region, itemType = 'service') => {
  const taxRates = {
    'karnataka': { sgst: 9, cgst: 9 },
    'delhi': { sgst: 9, cgst: 9 },
    'maharashtra': { sgst: 9, cgst: 9 },
    'international': { vat: 0 }
  };

  const rates = taxRates[region.toLowerCase()] || taxRates['karnataka'];
  const sgst = rates.sgst ? (amount * rates.sgst / 100) : 0;
  const cgst = rates.cgst ? (amount * rates.cgst / 100) : 0;
  const vat = rates.vat ? (amount * rates.vat / 100) : 0;

  return {
    base_amount: amount,
    sgst,
    cgst,
    vat,
    total_tax: sgst + cgst + vat,
    total_amount: amount + sgst + cgst + vat
  };
};

// exports.generatePhonePeChecksum = generatePhonePeChecksum;
// exports.generateMerchantTransactionId = generateMerchantTransactionId;
// exports.PHONEPECONFIG = PHONEPECONFIG;

// exports.handleSuccessfulPayment = handleSuccessfulPayment;
// exports.handleFailedPayment = handleFailedPayment;

// exports.sendRenewalReminder = sendRenewalReminder;
// exports.sendOverdueReminder = sendOverdueReminder;
// exports.escalateToManagement = escalateToManagement;

// exports.syncToQuickBooks = syncToQuickBooks;
// exports.syncToZohoBooks = syncToZohoBooks;
// exports.syncToTally = syncToTally;





// ===========================================
// COMPLETE MODULE EXPORTS
// ===========================================

// module.exports = {
//   // Core functions
//   autoGenerateInvoice: exports.autoGenerateInvoice,
//   initiatePayment: exports.initiatePayment,
//   handlePaymentCallback: exports.handlePaymentCallback,
//   checkPaymentStatus: exports.checkPaymentStatus,
  
//   // Payment handlers
//   handleSuccessfulPayment: exports.handleSuccessfulPayment,
//   handleFailedPayment: exports.handleFailedPayment,
  
//   // Automation
//   checkRenewals: exports.checkRenewals,
//   handleOverdueInvoices: exports.handleOverdueInvoices,
  
//   // Accounting
//   syncInvoiceToAccounting: exports.syncInvoiceToAccounting,
//   syncToQuickBooks: exports.syncToQuickBooks,
//   syncToZohoBooks: exports.syncToZohoBooks,
//   syncToTally: exports.syncToTally,
  
//   // Reports
//   getRevenueDashboard: exports.getRevenueDashboard,
//   getOverdueInvoicesReport: exports.getOverdueInvoicesReport,
//   getChurnAnalysis: exports.getChurnAnalysis,
//   getActiveSubscriptions: exports.getActiveSubscriptions,
//   getInvoiceById: exports.getInvoiceById,
//   listInvoices: exports.listInvoices,
  
//   // Advanced features
//   recordPartialPayment: exports.recordPartialPayment,
//   processRefund: exports.processRefund,
//   retryFailedPayment: exports.retryFailedPayment,
//   processPartialPayment: exports.processPartialPayment,
//   convertCurrency: exports.convertCurrency,
//   createInvoiceWithCurrency: exports.createInvoiceWithCurrency,
//   calculateTax: exports.calculateTax,
  
//   // Utilities
//   generatePhonePeChecksum: exports.generatePhonePeChecksum,
//   generateMerchantTransactionId: exports.generateMerchantTransactionId,
//   PHONEPECONFIG: exports.PHONEPECONFIG
// };



module.exports = {
  autoGenerateInvoice: exports.autoGenerateInvoice,
  initiatePayment: exports.initiatePayment,
  handlePaymentCallback: exports.handlePaymentCallback,
  checkPaymentStatus: exports.checkPaymentStatus,
  checkRenewals: exports.checkRenewals,
  handleOverdueInvoices: exports.handleOverdueInvoices,
  syncInvoiceToAccounting: exports.syncInvoiceToAccounting,
  getRevenueDashboard: exports.getRevenueDashboard,
  getOverdueInvoicesReport: exports.getOverdueInvoicesReport,
  getChurnAnalysis: exports.getChurnAnalysis,
  getActiveSubscriptions: exports.getActiveSubscriptions,
  getInvoiceById: exports.getInvoiceById,
  listInvoices: exports.listInvoices,
  recordPartialPayment: exports.recordPartialPayment,
  processRefund: exports.processRefund,
  retryFailedPayment: exports.retryFailedPayment,
  processPartialPayment: exports.processPartialPayment,
  convertCurrency: exports.convertCurrency,
  createInvoiceWithCurrency: exports.createInvoiceWithCurrency,
  calculateTax: exports.calculateTax,
  generatePhonePeChecksum: exports.generatePhonePeChecksum || generatePhonePeChecksum,
  generateMerchantTransactionId: exports.generateMerchantTransactionId || generateMerchantTransactionId,
  PHONEPECONFIG: PHONEPECONFIG
};