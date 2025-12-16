const twilio = require('twilio');
const logger = require('../../utils/logger');

/**
 * Verify Twilio credentials
 */
exports.verifyTwilioCredentials = async (accountSid, authToken, phoneNumber) => {
  try {
    const client = twilio(accountSid, authToken);
    
    // Test by fetching the phone number
    await client.incomingPhoneNumbers.list({ phoneNumber: phoneNumber, limit: 1 });
    
    return true;
  } catch (error) {
    logger.error('Twilio credential verification failed:', error.message);
    return false;
  }
};

/**
 * Send SMS via Twilio
 */
exports.sendSms = async ({ account_sid, auth_token, from, to, body }) => {
  try {
    const client = twilio(account_sid, auth_token);
    
    const message = await client.messages.create({
      from: from,
      to: to,
      body: body
    });
    
    return {
      sid: message.sid,
      status: message.status,
      numSegments: message.numSegments,
      price: message.price,
      to: message.to,
      from: message.from
    };
  } catch (error) {
    logger.error('Twilio send SMS error:', error.message);
    throw new Error(`Failed to send SMS: ${error.message}`);
  }
};

/**
 * Get message status
 */
exports.getMessageStatus = async (account_sid, auth_token, message_sid) => {
  try {
    const client = twilio(account_sid, auth_token);
    
    const message = await client.messages(message_sid).fetch();
    
    return {
      sid: message.sid,
      status: message.status,
      dateCreated: message.dateCreated,
      dateSent: message.dateSent,
      dateUpdated: message.dateUpdated,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage
    };
  } catch (error) {
    logger.error('Get message status error:', error.message);
    throw new Error(`Failed to get message status: ${error.message}`);
  }
};

/**
 * Send bulk SMS
 */
exports.sendBulkSms = async ({ account_sid, auth_token, from, recipients, body, rateLimit = 5 }) => {
  const client = twilio(account_sid, auth_token);
  const results = [];
  const errors = [];
  
  // Rate limiting: send X messages per second
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let i = 0; i < recipients.length; i++) {
    try {
      const message = await client.messages.create({
        from: from,
        to: recipients[i].phone,
        body: recipients[i].message || body
      });
      
      results.push({
        phone: recipients[i].phone,
        sid: message.sid,
        status: message.status,
        success: true
      });
      
      // Rate limit delay
      if ((i + 1) % rateLimit === 0 && i < recipients.length - 1) {
        await delay(1000);
      }
    } catch (error) {
      logger.error(`Bulk SMS error for ${recipients[i].phone}:`, error.message);
      errors.push({
        phone: recipients[i].phone,
        error: error.message,
        success: false
      });
    }
  }
  
  return {
    total: recipients.length,
    sent: results.length,
    failed: errors.length,
    results: results,
    errors: errors
  };
};

/**
 * Format phone number to E.164 format
 */
exports.formatPhoneNumber = (phone, defaultCountryCode = '+91') => {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // If it starts with country code, add +
  if (cleaned.length > 10) {
    return '+' + cleaned;
  }
  
  // If it's 10 digits, add default country code
  if (cleaned.length === 10) {
    return defaultCountryCode + cleaned;
  }
  
  return phone;
};

/**
 * Calculate SMS segments
 */
exports.calculateSegments = (message) => {
  const length = message.length;
  
  // Check if message contains unicode characters
  const hasUnicode = /[^\x00-\x7F]/.test(message);
  
  if (hasUnicode) {
    // Unicode messages: 70 chars per segment, 67 for multi-part
    if (length <= 70) return 1;
    return Math.ceil(length / 67);
  } else {
    // GSM-7 messages: 160 chars per segment, 153 for multi-part
    if (length <= 160) return 1;
    return Math.ceil(length / 153);
  }
};

/**
 * Estimate SMS cost
 */
exports.estimateCost = (segments, pricePerSegment = 0.0075) => {
  return (segments * pricePerSegment).toFixed(4);
};

/**
 * Validate phone number
 */
exports.validatePhoneNumber = (phone) => {
  // Basic E.164 format validation
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
};

/**
 * Get SMS delivery report
 */
exports.getDeliveryReport = async (account_sid, auth_token, startDate, endDate) => {
  try {
    const client = twilio(account_sid, auth_token);
    
    const messages = await client.messages.list({
      dateSentAfter: new Date(startDate),
      dateSentBefore: new Date(endDate),
      limit: 1000
    });
    
    const report = {
      total: messages.length,
      sent: 0,
      delivered: 0,
      failed: 0,
      pending: 0,
      undelivered: 0,
      totalCost: 0
    };
    
    messages.forEach(msg => {
      switch (msg.status) {
        case 'sent':
          report.sent++;
          break;
        case 'delivered':
          report.delivered++;
          break;
        case 'failed':
          report.failed++;
          break;
        case 'pending':
          report.pending++;
          break;
        case 'undelivered':
          report.undelivered++;
          break;
      }
      
      if (msg.price) {
        report.totalCost += Math.abs(parseFloat(msg.price));
      }
    });
    
    report.deliveryRate = report.total > 0 ? 
      ((report.delivered / report.total) * 100).toFixed(2) : 0;
    
    return report;
  } catch (error) {
    logger.error('Get delivery report error:', error.message);
    throw new Error(`Failed to get delivery report: ${error.message}`);
  }
};

module.exports = exports;