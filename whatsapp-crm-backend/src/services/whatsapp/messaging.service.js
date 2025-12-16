const axios = require('axios');
const pool = require('../../config/database');
const redis = require('../../config/redis');
const { RATE_LIMITS } = require('../../config/constants');

/**
 * Check rate limits for WhatsApp messaging
 */
async function checkRateLimit(companyId, recipientNumber = null) {
  const now = Date.now();
  const results = {
    allowed: true,
    limits: {},
    retry_after: null
  };

  // Check company-level limits
  const companyKey = `ratelimit:company:${companyId}`;
  
  // Minute limit
  const minuteKey = `${companyKey}:minute:${Math.floor(now / 60000)}`;
  const minuteCount = await redis.incr(minuteKey);
  await redis.expire(minuteKey, 60);
  
  if (minuteCount > RATE_LIMITS.company.messages_per_minute) {
    results.allowed = false;
    results.limits.minute_exceeded = true;
    results.retry_after = 60 - (now % 60000) / 1000;
  }

  // Hour limit
  const hourKey = `${companyKey}:hour:${Math.floor(now / 3600000)}`;
  const hourCount = await redis.incr(hourKey);
  await redis.expire(hourKey, 3600);
  
  if (hourCount > RATE_LIMITS.company.messages_per_hour) {
    results.allowed = false;
    results.limits.hour_exceeded = true;
    results.retry_after = Math.max(results.retry_after || 0, 3600 - (now % 3600000) / 1000);
  }

  // Day limit
  const dayKey = `${companyKey}:day:${Math.floor(now / 86400000)}`;
  const dayCount = await redis.incr(dayKey);
  await redis.expire(dayKey, 86400);
  
  if (dayCount > RATE_LIMITS.company.messages_per_day) {
    results.allowed = false;
    results.limits.day_exceeded = true;
    results.retry_after = Math.max(results.retry_after || 0, 86400 - (now % 86400000) / 1000);
  }

  // Check recipient-level limits if provided
  if (recipientNumber) {
    const recipientKey = `ratelimit:recipient:${recipientNumber}`;
    
    const recipientHourKey = `${recipientKey}:hour:${Math.floor(now / 3600000)}`;
    const recipientHourCount = await redis.incr(recipientHourKey);
    await redis.expire(recipientHourKey, 3600);
    
    if (recipientHourCount > RATE_LIMITS.recipient.messages_per_hour) {
      results.allowed = false;
      results.limits.recipient_hour_exceeded = true;
    }

    const recipientDayKey = `${recipientKey}:day:${Math.floor(now / 86400000)}`;
    const recipientDayCount = await redis.incr(recipientDayKey);
    await redis.expire(recipientDayKey, 86400);
    
    if (recipientDayCount > RATE_LIMITS.recipient.messages_per_day) {
      results.allowed = false;
      results.limits.recipient_day_exceeded = true;
    }
  }

  return results;
}

/**
 * Send WhatsApp message via Meta API
 */
async function sendWhatsAppMessage(credentials, to, message) {
  const response = await axios.post(
    `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: { 
        preview_url: true,
        body: message 
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );

  return response.data;
}

/**
 * Get or create lead
 */
async function getOrCreateLead(phoneNumber, companyId) {
  let lead = await pool.query(
    'SELECT id FROM leads WHERE phone_number = $1 AND company_id = $2',
    [phoneNumber, companyId]
  );

  if (lead.rows.length === 0) {
    const newLead = await pool.query(
      `INSERT INTO leads (company_id, phone_number, lead_source) 
       VALUES ($1, $2, 'whatsapp') 
       RETURNING id`,
      [companyId, phoneNumber]
    );
    return newLead.rows[0].id;
  }

  return lead.rows[0].id;
}

/**
 * Get or create conversation
 */
async function getOrCreateConversation(leadId, phoneNumber) {
  let conversation = await pool.query(
    'SELECT id FROM conversations WHERE lead_id = $1',
    [leadId]
  );

  if (conversation.rows.length === 0) {
    const newConv = await pool.query(
      `INSERT INTO conversations (lead_id, phone_number) 
       VALUES ($1, $2) 
       RETURNING id`,
      [leadId, phoneNumber]
    );
    return newConv.rows[0].id;
  }

  return conversation.rows[0].id;
}

/**
 * Log message to database
 */
async function logMessage(leadId, conversationId, phoneNumber, message, messageId, isFromUser) {
  await pool.query(
    `INSERT INTO whatsapp_messages 
     (lead_id, conversation_id, phone_number, message_body, sender, is_from_user, message_id, delivery_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [leadId, conversationId, phoneNumber, message, isFromUser ? 'user' : 'agent', isFromUser, messageId, 'sent']
  );

  // Update conversation
  await pool.query(
    `UPDATE conversations 
     SET last_message = $1, 
         last_message_timestamp = NOW(),
         message_count = message_count + 1,
         updated_at = NOW()
     WHERE id = $2`,
    [message, conversationId]
  );
}

module.exports = {
  checkRateLimit,
  sendWhatsAppMessage,
  getOrCreateLead,
  getOrCreateConversation,
  logMessage
};