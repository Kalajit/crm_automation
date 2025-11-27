// src/services/multiChannel/multiChannel.service.js

const axios = require('axios');
const twilio = require('twilio');
const logger = require('../../utils/logger');

class MultiChannelService {
  constructor(pool) {
    this.pool = pool;
  }

  // ============================================
  // SMS METHODS
  // ============================================

  async sendSMS(companyId, toNumber, message, provider = 'twilio') {
    try {
      const credentialsResult = await this.pool.query(
        `SELECT ai.twilio_credentials 
         FROM agent_instances ai
         WHERE ai.company_id = $1 
         AND ai.twilio_credentials IS NOT NULL
         LIMIT 1`,
        [companyId]
      );

      if (credentialsResult.rows.length === 0) {
        throw new Error('SMS credentials not configured');
      }

      const credentials = credentialsResult.rows[0].twilio_credentials;
      const twilioClient = twilio(credentials.account_sid, credentials.auth_token);

      const smsResult = await twilioClient.messages.create({
        body: message,
        from: credentials.phone_number,
        to: toNumber
      });

      let lead = await this.pool.query(
        'SELECT id FROM leads WHERE phone_number = $1 AND company_id = $2',
        [toNumber, companyId]
      );

      let leadId = lead.rows[0]?.id;
      if (!leadId) {
        const newLead = await this.pool.query(
          `INSERT INTO leads (company_id, phone_number, lead_source) 
           VALUES ($1, $2, 'sms') RETURNING id`,
          [companyId, toNumber]
        );
        leadId = newLead.rows[0].id;
      }

      await this.pool.query(
        `INSERT INTO sms_messages 
         (company_id, lead_id, phone_number, message_body, direction, message_sid, status, provider)
         VALUES ($1, $2, $3, $4, 'outbound', $5, $6, $7)`,
        [companyId, leadId, toNumber, message, smsResult.sid, smsResult.status, provider]
      );

      return {
        success: true,
        message_sid: smsResult.sid,
        status: smsResult.status,
        lead_id: leadId
      };
    } catch (error) {
      logger.error('SMS send error:', error);
      throw error;
    }
  }

  async handleIncomingSMS(webhookData) {
    try {
      const { From, To, Body, MessageSid } = webhookData;

      const companyResult = await this.pool.query(
        `SELECT ai.company_id 
         FROM agent_instances ai
         WHERE ai.twilio_credentials->>'phone_number' = $1
         LIMIT 1`,
        [To]
      );

      if (companyResult.rows.length === 0) {
        throw new Error('Company not found for number');
      }

      const companyId = companyResult.rows[0].company_id;

      let lead = await this.pool.query(
        'SELECT id FROM leads WHERE phone_number = $1 AND company_id = $2',
        [From, companyId]
      );

      let leadId = lead.rows[0]?.id;
      if (!leadId) {
        const newLead = await this.pool.query(
          `INSERT INTO leads (company_id, phone_number, lead_source) 
           VALUES ($1, $2, 'sms') RETURNING id`,
          [companyId, From]
        );
        leadId = newLead.rows[0].id;
      }

      await this.pool.query(
        `INSERT INTO sms_messages 
         (company_id, lead_id, phone_number, message_body, direction, message_sid, status)
         VALUES ($1, $2, $3, $4, 'inbound', $5, 'received')`,
        [companyId, leadId, From, Body, MessageSid]
      );

      await this.pool.query(
        `INSERT INTO activity_feed 
         (company_id, lead_id, activity_type, activity_description)
         VALUES ($1, $2, 'sms_received', $3)`,
        [companyId, leadId, `Received SMS: ${Body.substring(0, 100)}...`]
      );

      return { success: true, lead_id: leadId };
    } catch (error) {
      logger.error('Incoming SMS handling error:', error);
      throw error;
    }
  }

  async getSMSHistory(leadId, limit = 50) {
    try {
      const query = `
        SELECT id, message_body, direction, status, created_at
        FROM sms_messages
        WHERE lead_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;

      const result = await this.pool.query(query, [leadId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getSMSHistory:', error);
      throw error;
    }
  }

  // ============================================
  // WEB CHAT METHODS
  // ============================================

  async initializeWebChat(companyId, visitorData = {}) {
    try {
      const { name, email, ip, metadata } = visitorData;

      const query = `
        INSERT INTO web_chat_sessions 
        (company_id, visitor_name, visitor_email, visitor_ip, status, metadata)
        VALUES ($1, $2, $3, $4, 'active', $5)
        RETURNING id, session_id
      `;

      const result = await this.pool.query(query, [
        companyId, name, email, ip, JSON.stringify(metadata || {})
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error in initializeWebChat:', error);
      throw error;
    }
  }

  async sendWebChatMessage(sessionId, senderType, senderId, message, attachments = []) {
    try {
      const query = `
        INSERT INTO web_chat_messages 
        (session_id, sender_type, sender_id, message_text, attachments)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at
      `;

      const result = await this.pool.query(query, [
        sessionId, senderType, senderId, message, JSON.stringify(attachments)
      ]);

      await this.pool.query(
        `UPDATE web_chat_sessions SET updated_at = NOW() WHERE session_id = $1`,
        [sessionId]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Error in sendWebChatMessage:', error);
      throw error;
    }
  }

  async getWebChatMessages(sessionId, limit = 100) {
    try {
      const query = `
        SELECT wcm.*, 
          CASE 
            WHEN wcm.sender_type = 'agent' THEN ha.name
            ELSE NULL
          END as sender_name
        FROM web_chat_messages wcm
        LEFT JOIN human_agents ha ON wcm.sender_id = ha.id AND wcm.sender_type = 'agent'
        WHERE wcm.session_id = $1
        ORDER BY wcm.created_at ASC
        LIMIT $2
      `;

      const result = await this.pool.query(query, [sessionId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getWebChatMessages:', error);
      throw error;
    }
  }

  async assignWebChatToAgent(sessionId, agentId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE web_chat_sessions 
         SET assigned_agent_id = $1, status = 'assigned'
         WHERE session_id = $2`,
        [agentId, sessionId]
      );

      await client.query(
        `INSERT INTO web_chat_messages 
         (session_id, sender_type, message_text)
         VALUES ($1, 'bot', $2)`,
        [sessionId, 'An agent has joined the chat']
      );

      await client.query(
        `INSERT INTO push_notifications 
         (agent_id, notification_type, title, body, data)
         VALUES ($1, 'chat_assigned', 'New Chat', 'You have been assigned a new web chat', $2)`,
        [agentId, JSON.stringify({ session_id: sessionId })]
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in assignWebChatToAgent:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async endWebChatSession(sessionId) {
    try {
      await this.pool.query(
        `UPDATE web_chat_sessions 
         SET status = 'ended', ended_at = NOW()
         WHERE session_id = $1`,
        [sessionId]
      );

      return { success: true };
    } catch (error) {
      logger.error('Error in endWebChatSession:', error);
      throw error;
    }
  }

  async getActiveWebChats(companyId) {
    try {
      const query = `
        SELECT wcs.*, ha.name as agent_name,
          (SELECT COUNT(*) FROM web_chat_messages wcm 
           WHERE wcm.session_id = wcs.session_id 
           AND wcm.is_read = false 
           AND wcm.sender_type = 'visitor') as unread_count
        FROM web_chat_sessions wcs
        LEFT JOIN human_agents ha ON wcs.assigned_agent_id = ha.id
        WHERE wcs.company_id = $1
        AND wcs.status IN ('active', 'assigned')
        ORDER BY wcs.started_at DESC
      `;

      const result = await this.pool.query(query, [companyId]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getActiveWebChats:', error);
      throw error;
    }
  }

  // ============================================
  // SOCIAL MEDIA METHODS
  // ============================================

  async connectSocialAccount(companyId, platform, accountData) {
    try {
      const { account_id, account_name, access_token, page_id } = accountData;
      const encryptedToken = Buffer.from(access_token).toString('base64');

      const query = `
        INSERT INTO social_media_accounts 
        (company_id, platform, account_id, account_name, access_token_encrypted, page_id, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT (company_id, platform, account_id) 
        DO UPDATE SET 
          access_token_encrypted = $5,
          page_id = $6,
          is_active = true,
          updated_at = NOW()
        RETURNING id
      `;

      const result = await this.pool.query(query, [
        companyId, platform, account_id, account_name, encryptedToken, page_id
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error in connectSocialAccount:', error);
      throw error;
    }
  }

  async syncFacebookMessages(accountId) {
    try {
      const accountResult = await this.pool.query(
        `SELECT * FROM social_media_accounts WHERE id = $1`,
        [accountId]
      );

      if (accountResult.rows.length === 0) {
        throw new Error('Account not found');
      }

      const account = accountResult.rows[0];
      const accessToken = Buffer.from(account.access_token_encrypted, 'base64').toString();

      const response = await axios.get(
        `https://graph.facebook.com/v18.0/${account.page_id}/conversations`,
        {
          params: {
            access_token: accessToken,
            fields: 'participants,messages{message,from,created_time}'
          }
        }
      );

      const conversations = response.data.data;
      let syncedCount = 0;

      for (const conversation of conversations) {
        for (const message of conversation.messages.data) {
          const exists = await this.pool.query(
            `SELECT id FROM social_media_messages 
             WHERE account_id = $1 AND platform_message_id = $2`,
            [accountId, message.id]
          );

          if (exists.rows.length === 0) {
            const senderId = message.from.id;
            let lead = await this.pool.query(
              `SELECT id FROM leads 
               WHERE metadata->>'facebook_id' = $1 
               AND company_id = $2`,
              [senderId, account.company_id]
            );

            let leadId = lead.rows[0]?.id;
            if (!leadId) {
              const newLead = await this.pool.query(
                `INSERT INTO leads (company_id, lead_source, metadata) 
                 VALUES ($1, 'facebook', $2) RETURNING id`,
                [account.company_id, JSON.stringify({ facebook_id: senderId })]
              );
              leadId = newLead.rows[0].id;
            }

            await this.pool.query(
              `INSERT INTO social_media_messages 
               (account_id, lead_id, platform_message_id, sender_platform_id, 
                sender_name, message_text, direction)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [accountId, leadId, message.id, senderId, message.from.name, message.message,
               message.from.id === account.page_id ? 'outbound' : 'inbound']
            );

            syncedCount++;
          }
        }
      }

      await this.pool.query(
        `UPDATE social_media_accounts SET last_sync_at = NOW() WHERE id = $1`,
        [accountId]
      );

      return { success: true, synced_messages: syncedCount };
    } catch (error) {
      logger.error('Facebook sync error:', error);
      throw error;
    }
  }

  async sendSocialMessage(accountId, recipientId, message) {
    try {
      const accountResult = await this.pool.query(
        `SELECT * FROM social_media_accounts WHERE id = $1`,
        [accountId]
      );

      if (accountResult.rows.length === 0) {
        throw new Error('Account not found');
      }

      const account = accountResult.rows[0];
      const accessToken = Buffer.from(account.access_token_encrypted, 'base64').toString();

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/me/messages`,
        {
          recipient: { id: recipientId },
          message: { text: message }
        },
        {
          params: { access_token: accessToken }
        }
      );

      let lead = await this.pool.query(
        `SELECT id FROM leads 
         WHERE metadata->>'${account.platform}_id' = $1 
         AND company_id = $2`,
        [recipientId, account.company_id]
      );

      let leadId = lead.rows[0]?.id;

      await this.pool.query(
        `INSERT INTO social_media_messages 
         (account_id, lead_id, platform_message_id, sender_platform_id, 
          message_text, direction)
         VALUES ($1, $2, $3, $4, $5, 'outbound')`,
        [accountId, leadId, response.data.message_id, account.page_id, message]
      );

      return {
        success: true,
        message_id: response.data.message_id
      };
    } catch (error) {
      logger.error('Social message send error:', error);
      throw error;
    }
  }

  async getSocialMessages(accountId, limit = 50) {
    try {
      const query = `
        SELECT smm.*, l.name as lead_name, l.phone_number
        FROM social_media_messages smm
        LEFT JOIN leads l ON smm.lead_id = l.id
        WHERE smm.account_id = $1
        ORDER BY smm.created_at DESC
        LIMIT $2
      `;

      const result = await this.pool.query(query, [accountId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getSocialMessages:', error);
      throw error;
    }
  }

  async handleSocialWebhook(platform, webhookData) {
    try {
      switch (platform) {
        case 'facebook':
        case 'instagram':
          return await this.handleFacebookWebhook(webhookData);
        default:
          throw new Error('Unsupported platform');
      }
    } catch (error) {
      logger.error('Social webhook error:', error);
      throw error;
    }
  }

  async handleFacebookWebhook(webhookData) {
    try {
      const entry = webhookData.entry[0];
      const messaging = entry.messaging[0];

      if (messaging.message) {
        const senderId = messaging.sender.id;
        const message = messaging.message.text;
        const pageId = messaging.recipient.id;

        const account = await this.pool.query(
          `SELECT * FROM social_media_accounts 
           WHERE page_id = $1 
           AND platform IN ('facebook', 'instagram')`,
          [pageId]
        );

        if (account.rows.length === 0) {
          return { success: false, error: 'Account not found' };
        }

        const accountData = account.rows[0];

        let lead = await this.pool.query(
          `SELECT id FROM leads 
           WHERE metadata->>'facebook_id' = $1 
           AND company_id = $2`,
          [senderId, accountData.company_id]
        );

        let leadId = lead.rows[0]?.id;
        if (!leadId) {
          const newLead = await this.pool.query(
            `INSERT INTO leads (company_id, lead_source, metadata) 
             VALUES ($1, $2, $3) RETURNING id`,
            [accountData.company_id, 'facebook', JSON.stringify({ facebook_id: senderId })]
          );
          leadId = newLead.rows[0].id;
        }

        await this.pool.query(
          `INSERT INTO social_media_messages 
           (account_id, lead_id, platform_message_id, sender_platform_id, 
            message_text, message_type, direction)
           VALUES ($1, $2, $3, $4, $5, 'text', 'inbound')`,
          [accountData.id, leadId, messaging.message.mid, senderId, message]
        );

        return { success: true, lead_id: leadId };
      }

      return { success: true, message: 'Event processed' };
    } catch (error) {
      logger.error('Facebook webhook error:', error);
      throw error;
    }
  }
}

module.exports = MultiChannelService;