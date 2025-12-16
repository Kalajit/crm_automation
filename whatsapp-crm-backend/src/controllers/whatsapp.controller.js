const pool = require('../config/database');
const redis = require('../config/redis');
const axios = require('axios');
const { RATE_LIMITS, WEBHOOK_VERIFY_TOKEN } = require('../config/constants');
const { detectLanguage, translateText } = require('../services/whatsapp/translation.service');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');
const logger = require('../utils/logger');
const {
  handleMultilingualWhatsAppMessage,
  sendWhatsAppResponse
} = require('../services/whatsapp/multilingualService');
const {
  createGoogleCalendarEvent,
  checkCalendarAvailability
} = require('../services/calendar/calendarService');
const {
  sendCalendarConfirmationEmail
} = require('../services/email/emailConfirmationService');
const {
  generateAlternativeSlotsMessage,
  generateWhatsAppConfirmation,
  getAvailableSlots
} = require('../services/whatsapp/appointmentService');


/**
 * Start OAuth flow
 */
exports.startOAuth = async (req, res) => {
  try {
    const { company_id, agent_instance_id } = req.query;
    
    if (!company_id || !agent_instance_id) {
      return res.status(400).json({ 
        success: false,
        error: 'company_id and agent_instance_id required' 
      });
    }
    
    // Store in session for callback
    req.session.oauth_state = {
      company_id: parseInt(company_id),
      agent_instance_id: parseInt(agent_instance_id),
      timestamp: Date.now()
    };
    
    // Use state parameter for security (prevents CSRF)
    const state = Buffer.from(JSON.stringify({
      company_id,
      agent_instance_id,
      nonce: Math.random().toString(36).substr(2, 9)
    })).toString('base64');
    
    const redirectUri = `${process.env.BASE_URL}/api/whatsapp/oauth/callback`;
    
    // Correct OAuth URL with all required scopes
    const authUrl = 
      `https://www.facebook.com/v21.0/dialog/oauth?` +
      `client_id=${process.env.META_APP_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${encodeURIComponent(state)}&` +
      `scope=whatsapp_business_messaging,whatsapp_business_management,business_management`;
    
    console.log('✅ OAuth flow initiated:', { company_id, agent_instance_id });
    logRequest('GET', '/api/whatsapp/oauth/start', 200);

    res.json({ 
      success: true,
      data: {
        auth_url: authUrl,
        expires_in: 3600
      },
      message: 'Redirect user to auth_url'
    });
    
  } catch (error) {
    console.error('❌ OAuth start error:', error);
    logRequest('GET', '/api/whatsapp/oauth/start', 500);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

/**
 * OAuth callback handler
 */
exports.oauthCallback = async (req, res) => {
  try {
    const { code, state, error: oauth_error, error_description } = req.query;
    
    // Handle OAuth errors
    if (oauth_error) {
      console.error('❌ OAuth error from Facebook:', oauth_error, error_description);
      return res.status(400).send(generateErrorPage(oauth_error, error_description));
    }
    
    if (!code || !state) {
      return res.status(400).send('Invalid OAuth callback: Missing code or state');
    }
    
    // Decode state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
      return res.status(400).send('Invalid state parameter');
    }
    
    const { company_id, agent_instance_id } = stateData;
    console.log('📞 Processing OAuth callback for:', { company_id, agent_instance_id });
    
    // STEP 1: Exchange code for access token
    const redirectUri = `${process.env.BASE_URL}/api/whatsapp/oauth/callback`;
    
    const tokenResponse = await axios.post(
      'https://graph.facebook.com/v21.0/oauth/access_token',
      null,
      {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          code: code,
          redirect_uri: redirectUri
        },
        timeout: 10000
      }
    );
    
    const accessToken = tokenResponse.data.access_token;
    console.log('✅ Access token obtained');

    // STEP 2: Get token debug info
    const debugResponse = await axios.get(
      'https://graph.facebook.com/v21.0/debug_token',
      {
        params: {
          input_token: accessToken,
          access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`
        },
        timeout: 10000
      }
    );
    
    const tokenData = debugResponse.data.data;
    const grantedScopes = tokenData.granular_scopes || [];
    console.log('✅ Granted scopes:', grantedScopes.map(s => s.scope));
    
    // STEP 3: Extract WABA ID
    let wabaId = await extractWABAId(grantedScopes, accessToken);
    
    if (!wabaId) {
      return res.status(400).send(generateSetupRequiredPage());
    }

    // STEP 4: Get phone numbers from WABA
    const phoneResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers`,
      {
        params: { 
          access_token: accessToken,
          fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status'
        },
        timeout: 10000
      }
    );
    
    if (!phoneResponse.data.data || phoneResponse.data.data.length === 0) {
      throw new Error('No phone numbers found. Please add a phone number to your WhatsApp Business Account in Meta Console.');
    }
    
    const phoneData = phoneResponse.data.data[0];
    const phoneNumberId = phoneData.id;
    const displayPhoneNumber = phoneData.display_phone_number;
    const verifiedName = phoneData.verified_name || 'Business';
    
    console.log('✅ Phone Number:', displayPhoneNumber, 'ID:', phoneNumberId);
    
    // STEP 5: Get Business Account ID
    let businessAccountId = await getBusinessAccountId(accessToken);
    
    // STEP 6: Save to database
    const verifyToken = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
    
    const updateResult = await pool.query(`
      UPDATE agent_instances
      SET 
        whatsapp_number = $1,
        whatsapp_credentials = $2::jsonb,
        webhook_verify_token = $3,
        token_expires_at = NOW() + INTERVAL '60 days',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND company_id = $5
      RETURNING id, agent_name
    `, [
      displayPhoneNumber,
      JSON.stringify({
        access_token: accessToken,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        business_account_id: businessAccountId,
        verified_name: verifiedName,
        quality_rating: phoneData.quality_rating || 'UNKNOWN',
        code_verification_status: phoneData.code_verification_status || 'UNKNOWN',
        connected_at: new Date().toISOString(),
        scopes: grantedScopes.map(s => s.scope)
      }),
      verifyToken,
      agent_instance_id,
      company_id
    ]);
    
    if (updateResult.rows.length === 0) {
      throw new Error('Agent instance not found or company_id mismatch');
    }
    
    console.log('✅ Credentials saved to database');
    logRequest('GET', '/api/whatsapp/oauth/callback', 200);
    
    // STEP 7: Success page
    const webhookUrl = `${process.env.BASE_URL}/api/whatsapp/webhook/universal`;
    const agentName = updateResult.rows[0].agent_name;
    
    res.send(generateSuccessPage(agentName, displayPhoneNumber, verifiedName, wabaId, webhookUrl, verifyToken));
    
  } catch (error) {
    console.error('❌ OAuth callback error:', error.response?.data || error.message);
    logRequest('GET', '/api/whatsapp/oauth/callback', 500);
    res.status(500).send(generateErrorPage('Connection Failed', error.message));
  }
};

/**
 * Get OAuth status
 */
exports.getOAuthStatus = async (req, res) => {
  try {
    const { agent_instance_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        whatsapp_number,
        whatsapp_credentials,
        webhook_verify_token,
        token_expires_at,
        CASE 
          WHEN whatsapp_credentials::text != '{}'::text 
          AND whatsapp_credentials::jsonb ? 'access_token' 
          THEN true 
          ELSE false 
        END as is_connected
      FROM agent_instances
      WHERE id = $1
    `, [agent_instance_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Agent instance not found' 
      });
    }
    
    const agent = result.rows[0];
    
    // Calculate days until expiry
    let daysUntilExpiry = null;
    if (agent.token_expires_at) {
      const expiryDate = new Date(agent.token_expires_at);
      const now = new Date();
      daysUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
    }
    
    logRequest('GET', `/api/whatsapp/oauth/status/${agent_instance_id}`, 200);
    res.json({
      success: true,
      data: {
        is_connected: agent.is_connected,
        whatsapp_number: agent.whatsapp_number,
        token_expires_at: agent.token_expires_at,
        days_until_expiry: daysUntilExpiry,
        needs_renewal: daysUntilExpiry !== null && daysUntilExpiry < 7
      }
    });
    
  } catch (error) {
    console.error('Get OAuth status error:', error);
    logRequest('GET', `/api/whatsapp/oauth/status/${req.params.agent_instance_id}`, 500);
    handleError(res, error);
  }
};

/**
 * Disconnect WhatsApp
 */
exports.disconnectWhatsApp = async (req, res) => {
  try {
    const { agent_instance_id } = req.params;
    
    // Clear credentials
    await pool.query(`
      UPDATE agent_instances
      SET 
        whatsapp_credentials = '{}'::jsonb,
        webhook_verify_token = NULL,
        token_expires_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [agent_instance_id]);
    
    console.log('✅ WhatsApp disconnected for agent:', agent_instance_id);
    logRequest('DELETE', `/api/whatsapp/oauth/disconnect/${agent_instance_id}`, 200);
    
    sendSuccess(res, { message: 'WhatsApp disconnected successfully' });
    
  } catch (error) {
    console.error('Disconnect error:', error);
    logRequest('DELETE', `/api/whatsapp/oauth/disconnect/${req.params.agent_instance_id}`, 500);
    handleError(res, error);
  }
};



/**
 * Send WhatsApp message
 */
exports.sendMessage = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { to, message, agent_instance_id, priority = 'normal' } = req.body;
    const messagingService = require('../services/whatsapp/messaging.service');

    // Validation
    if (!to || !message || !agent_instance_id) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['to', 'message', 'agent_instance_id']
      });
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(to)) {
      return res.status(400).json({ 
        error: 'Invalid phone number format',
        message: 'Phone number must be in E.164 format'
      });
    }

    if (message.length > 4096) {
      return res.status(400).json({ 
        error: 'Message too long',
        max_length: 4096
      });
    }

    // Get agent credentials
    const agentResult = await pool.query(
      `SELECT ai.*, c.id as company_id 
       FROM agent_instances ai
       JOIN companies c ON ai.company_id = c.id
       WHERE ai.id = $1`,
      [agent_instance_id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent instance not found' });
    }

    const agent = agentResult.rows[0];
    const credentials = agent.whatsapp_credentials;

    if (!credentials || !credentials.phone_number_id || !credentials.access_token) {
      return res.status(500).json({ error: 'Invalid WhatsApp credentials' });
    }

    // Check rate limits (skip for high priority)
    if (priority !== 'high') {
      const rateLimitCheck = await messagingService.checkRateLimit(agent.company_id, to);
      
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          limits: rateLimitCheck.limits,
          retry_after: rateLimitCheck.retry_after
        });
      }
    }

    // Get or create lead & conversation
    const leadId = await messagingService.getOrCreateLead(to, agent.company_id);
    const conversationId = await messagingService.getOrCreateConversation(leadId, to);

    // Send message
    const whatsappResponse = await messagingService.sendWhatsAppMessage(credentials, to, message);
    const messageId = whatsappResponse.messages?.[0]?.id;

    // Log message
    await messagingService.logMessage(leadId, conversationId, to, message, messageId, false);

    const duration = Date.now() - startTime;
    logRequest('POST', '/api/whatsapp/send', 200);
    
    res.json({ 
      success: true, 
      message_id: messageId,
      data: whatsappResponse,
      duration_ms: duration
    });

  } catch (error) {
    console.error('WhatsApp send error:', error.response?.data || error.message);
    logRequest('POST', '/api/whatsapp/send', 500);
    res.status(error.response?.status || 500).json({ 
      error: error.message,
      details: error.response?.data
    });
  }
};

/**
 * Handle WhatsApp webhook
 */
exports.handleWebhook = async (req, res) => {
  try {
    const { entry } = req.body;

    if (!entry || entry.length === 0) {
      return res.sendStatus(200);
    }

    // Process incoming message
    for (const change of entry[0].changes) {
      if (change.field !== 'messages') continue;

      const message = change.value.messages[0];
      if (!message) continue;
      
      const fromPhone = message.from;
      const toPhone = change.value.metadata.display_phone_number;
      const text = message.text?.body || '';

      // Find agent instance
      const agentResult = await pool.query(`
        SELECT ai.*, c.name as company_name
        FROM agent_instances ai
        LEFT JOIN companies c ON ai.company_id = c.id
        WHERE ai.whatsapp_number = $1 
          AND ai.agent_type = 'whatsapp' 
          AND ai.is_active = TRUE
      `, [toPhone.startsWith('+') ? toPhone : `+${toPhone}`]);

      if (agentResult.rows.length === 0) {
        console.log('⚠️ Unknown WhatsApp number:', toPhone);
        return res.sendStatus(404);
      }

      const agentInstance = agentResult.rows[0];

      // Store incoming message
      const messagingService = require('../services/whatsapp/messaging.service');
      const leadId = await messagingService.getOrCreateLead(fromPhone, agentInstance.company_id);
      const conversationId = await messagingService.getOrCreateConversation(leadId, fromPhone);
      await messagingService.logMessage(leadId, conversationId, fromPhone, text, message.id, true);

      // Forward to n8n
      const n8nWebhookUrl = process.env.N8N_WHATSAPP_WEBHOOK_URL;
      
      if (n8nWebhookUrl) {
        try {
          await axios.post(n8nWebhookUrl, {
            message: {
              from: fromPhone,
              text: { body: text },
              type: message.type
            },
            agent_instance: {
              id: agentInstance.id,
              company_id: agentInstance.company_id,
              credentials: agentInstance.whatsapp_credentials
            }
          }, { timeout: 30000 });
        } catch (n8nError) {
          console.error('❌ n8n webhook error:', n8nError.message);
        }
      }
    }

    res.sendStatus(200);
    
  } catch (error) {
    console.error('❌ WhatsApp webhook error:', error);
    res.sendStatus(200);
  }
};

/**
 * Verify webhook
 */
exports.verifyWebhook = async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (token === process.env.WEBHOOK_VERIFY_TOKEN) {
      console.log('✅ Webhook verified successfully!');
      return res.status(200).send(challenge);
    } else {
      console.log('❌ Invalid verify token:', token);
      return res.sendStatus(403);
    }
  }

  res.sendStatus(400);
};

/**
 * Save credentials manually
 */
exports.saveCredentials = async (req, res) => {
  try {
    const { id } = req.params;
    const { access_token, phone_number_id, business_account_id } = req.body;

    if (!access_token || !phone_number_id) {
      return res.status(400).json({ error: 'access_token and phone_number_id required' });
    }

    const verifyToken = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await pool.query(`
      UPDATE agent_instances
      SET 
        whatsapp_credentials = $1,
        webhook_verify_token = $2,
        token_expires_at = NOW() + INTERVAL '60 days',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [
      JSON.stringify({ access_token, phone_number_id, business_account_id }),
      verifyToken,
      id
    ]);

    logRequest('POST', `/api/agent-instances/${id}/whatsapp-credentials`, 200);
    res.json({ 
      success: true, 
      message: 'Credentials saved',
      webhook_url: `${process.env.BASE_URL}/api/whatsapp/webhook/universal`,
      verify_token: verifyToken
    });
  } catch (error) {
    logRequest('POST', `/api/agent-instances/${id}/whatsapp-credentials`, 500);
    handleError(res, error);
  }
};



exports.sendManualMessage = async (req, res) => {
  try {
    const { agent_instance_id, to, message, lead_id } = req.body;
    
    if (!agent_instance_id || !to || !message) {
      return res.status(400).json({ 
        error: 'agent_instance_id, to, and message required' 
      });
    }
    
    const agent = await pool.query(
      'SELECT whatsapp_credentials FROM agent_instances WHERE id = $1',
      [agent_instance_id]
    );
    
    if (agent.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const credentials = agent.rows[0].whatsapp_credentials;
    
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
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
    
    if (lead_id) {
      await pool.query(`
        INSERT INTO whatsapp_messages 
        (lead_id, phone_number, message_type, message_body, sender, is_from_user)
        VALUES ($1, $2, 'text', $3, 'agent', false)
      `, [lead_id, to, message]);
    }
    
    logRequest('POST', '/api/whatsapp/send-manual', 200);
    res.json({ success: true, message_id: response.data.messages[0].id });
    
  } catch (error) {
    logRequest('POST', '/api/whatsapp/send-manual', 500);
    handleError(res, error);
  }
};

// Helper functions for HTML pages
function generateErrorPage(error, description) {
  return `
    <!DOCTYPE html>
    <html>
    <head><title>Connection Failed</title></head>
    <body style="font-family: Arial; text-align: center; margin-top: 50px;">
      <h1>❌ WhatsApp Connection Failed</h1>
      <p><strong>Error:</strong> ${error}</p>
      <p>${description || 'User cancelled authorization'}</p>
      <a href="/" style="color: #25D366;">← Back to Dashboard</a>
    </body>
    </html>
  `;
}

function generateSetupRequiredPage() {
  return `<!DOCTYPE html>
    <html>
    <head><title>Setup Required</title></head>
    <body style="font-family: Arial; padding: 50px;">
      <h1>⚠️ Additional Setup Required</h1>
      <p>Your app is in Development Mode. Please add a phone number in Meta Console.</p>
      <a href="/" style="color: #667eea;">← Back</a>
    </body>
    </html>`;
}

function generateSuccessPage(agentName, phone, verifiedName, wabaId, webhookUrl, verifyToken) {
  // Full success HTML page code here
  return `<!DOCTYPE html>
    <html>
    <head><title>WhatsApp Connected ✅</title></head>
    <body>
      <h1>✅ WhatsApp Connected!</h1>
      <p>Agent "${agentName}" connected to ${phone}</p>
      <p>WABA ID: ${wabaId}</p>
      <p>Webhook URL: ${webhookUrl}</p>
      <p>Verify Token: ${verifyToken}</p>
    </body>
    </html>`;
}

async function extractWABAId(scopes, accessToken) {
  // Extract WABA from scopes or API call
  for (const scope of scopes) {
    if (scope.scope === 'whatsapp_business_messaging' || 
        scope.scope === 'whatsapp_business_management') {
      if (scope.target_ids && scope.target_ids.length > 0) {
        return scope.target_ids[0];
      }
    }
  }
  
  // Fallback: Try direct query
  try {
    const response = await axios.get('https://graph.facebook.com/v21.0/me', {
      params: { access_token: accessToken, fields: 'whatsapp_business_account' },
      timeout: 10000
    });
    return response.data.whatsapp_business_account?.id || null;
  } catch {
    return null;
  }
}

async function getBusinessAccountId(accessToken) {
  try {
    const response = await axios.get('https://graph.facebook.com/v21.0/me/businesses', {
      params: { access_token: accessToken },
      timeout: 10000
    });
    return response.data.data?.[0]?.id || null;
  } catch {
    return null;
  }
}


// ============================================
// WHATSAPP APPOINTMENT SCHEDULING
// ============================================

exports.scheduleAppointment = async (req, res) => {
  try {
    const {
      agent_instance_id,
      lead_phone,
      appointment_type,
      preferred_date,
      preferred_time,
      duration_minutes = 60
    } = req.body;
    
    if (!agent_instance_id || !lead_phone || !preferred_date) {
      return res.status(400).json({
        error: 'agent_instance_id, lead_phone, and preferred_date required'
      });
    }
    
    const leadResult = await pool.query(
      'SELECT id, name, email, preferred_language FROM leads WHERE phone_number = $1',
      [lead_phone]
    );
    
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = leadResult.rows[0];
    
    const agentResult = await pool.query(`
      SELECT ai.*, ai.company_id, c.name as company_name
      FROM agent_instances ai
      JOIN companies c ON ai.company_id = c.id
      WHERE ai.id = $1
    `, [agent_instance_id]);
    
    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent instance not found' });
    }
    
    const agent = agentResult.rows[0];
    
    const calendarResult = await pool.query(
      'SELECT id FROM calendar_configs WHERE company_id = $1 AND is_active = TRUE LIMIT 1',
      [agent.company_id]
    );
    
    if (calendarResult.rows.length === 0) {
      return res.status(400).json({
        error: 'No active calendar configuration found for this company'
      });
    }
    
    const calendar_config_id = calendarResult.rows[0].id;
    
    const appointmentDate = new Date(preferred_date);
    if (preferred_time) {
      const [hours, minutes] = preferred_time.split(':');
      appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else {
      appointmentDate.setHours(14, 0, 0, 0);
    }
    
    const endTime = new Date(appointmentDate.getTime() + duration_minutes * 60000);
    
    const availability = await checkCalendarAvailability(
      calendar_config_id,
      appointmentDate.toISOString(),
      endTime.toISOString()
    );
    
    if (!availability.available) {
      const alternativeMessage = await generateAlternativeSlotsMessage(
        calendar_config_id,
        appointmentDate,
        lead.preferred_language
      );
      
      await sendWhatsAppResponse(
        agent,
        lead_phone,
        alternativeMessage,
        lead.preferred_language
      );
      
      return res.json({
        success: false,
        available: false,
        message: 'Slot not available, alternatives sent via WhatsApp'
      });
    }
    
    const bookingResult = await pool.query(`
      INSERT INTO bookings (
        lead_id, phone_number, booking_type,
        scheduled_date, duration_minutes, status
      )
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING id
    `, [
      lead.id,
      lead_phone,
      appointment_type || 'consultation',
      appointmentDate.toISOString(),
      duration_minutes
    ]);
    
    const booking_id = bookingResult.rows[0].id;
    
    const eventTitle = `${appointment_type || 'Consultation'} - ${lead.name || 'Customer'}`;
    const eventDescription = `WhatsApp booking for ${lead.name}\nPhone: ${lead_phone}\nEmail: ${lead.email || 'N/A'}`;
    
    const calendarEvent = await createGoogleCalendarEvent(calendar_config_id, {
      lead_id: lead.id,
      booking_id: booking_id,
      title: eventTitle,
      description: eventDescription,
      start_time: appointmentDate.toISOString(),
      end_time: endTime.toISOString(),
      attendees: lead.email ? [lead.email] : []
    });
    
    await pool.query(`
      UPDATE bookings
      SET calendar_event_id = $1, status = 'confirmed'
      WHERE id = $2
    `, [calendarEvent.event_id, booking_id]);
    
    const confirmationMessage = await generateWhatsAppConfirmation(
      lead,
      appointmentDate,
      calendarEvent.meeting_link,
      agent.company_name
    );
    
    await sendWhatsAppResponse(
      agent,
      lead_phone,
      confirmationMessage,
      lead.preferred_language
    );
    
    if (lead.email) {
      const eventResult = await pool.query(
        'SELECT id FROM calendar_events WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1',
        [calendarEvent.event_id]
      );
      
      if (eventResult.rows.length > 0) {
        await sendCalendarConfirmationEmail(
          eventResult.rows[0].id,
          agent.company_id,
          lead.id
        );
      }
    }
    
    logRequest('POST', '/api/whatsapp/schedule-appointment', 201);
    res.status(201).json({
      success: true,
      booking_id: booking_id,
      calendar_event_id: calendarEvent.event_id,
      meeting_link: calendarEvent.meeting_link,
      scheduled_time: appointmentDate.toISOString(),
      message: 'Appointment scheduled and confirmation sent via WhatsApp'
    });
  } catch (error) {
    console.error('WhatsApp scheduling error:', error);
    logRequest('POST', '/api/whatsapp/schedule-appointment', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// WHATSAPP INVOICE SHARING
// ============================================

exports.sendInvoice = async (req, res) => {
  try {
    const {
      agent_instance_id,
      lead_phone,
      invoice_id,
      include_payment_link = true
    } = req.body;
    
    if (!agent_instance_id || !lead_phone || !invoice_id) {
      return res.status(400).json({
        error: 'agent_instance_id, lead_phone, and invoice_id required'
      });
    }
    
    const invoiceResult = await pool.query(`
      SELECT i.*, l.name as lead_name, l.email, l.preferred_language
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      WHERE i.id = $1 AND l.phone_number = $2
    `, [invoice_id, lead_phone]);
    
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const invoice = invoiceResult.rows[0];
    
    const agentResult = await pool.query(`
      SELECT ai.*, c.name as company_name
      FROM agent_instances ai
      JOIN companies c ON ai.company_id = c.id
      WHERE ai.id = $1
    `, [agent_instance_id]);
    
    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent instance not found' });
    }
    
    const agent = agentResult.rows[0];
    const credentials = agent.whatsapp_credentials;
    
    const dueDate = new Date(invoice.due_date);
    const dueDateStr = dueDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    
    let message = `🧾 *Invoice from ${agent.company_name}*\n\n`;
    message += `Invoice No: *${invoice.invoice_number}*\n`;
    message += `Amount: *${invoice.currency} ${invoice.amount.toLocaleString('en-IN')}*\n`;
    message += `Due Date: *${dueDateStr}*\n`;
    message += `Status: *${invoice.status.toUpperCase()}*\n\n`;
    
    if (invoice.status === 'pending') {
      message += `⚠️ Payment pending. Please complete before due date.\n\n`;
    }
    
    if (include_payment_link && invoice.pdf_url) {
      message += `📄 View Invoice: ${invoice.pdf_url}\n\n`;
    }
    
    message += `For questions, reply to this message.`;
    
    if (invoice.preferred_language !== 'en') {
      const { translateText } = require('../services/translation/translationService');
      message = await translateText(message, invoice.preferred_language, 'en');
    }
    
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
      {
        messaging_product: 'whatsapp',
        to: lead_phone,
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
    
    await pool.query(`
      UPDATE invoices
      SET 
        reminder_count = reminder_count + 1,
        last_reminder_sent = NOW()
      WHERE id = $1
    `, [invoice_id]);
    
    await pool.query(`
      INSERT INTO whatsapp_messages 
      (lead_id, phone_number, message_type, message_body, sender, is_from_user, message_id)
      VALUES ($1, $2, 'invoice', $3, 'bot', FALSE, $4)
    `, [
      invoice.lead_id,
      lead_phone,
      `Invoice ${invoice.invoice_number} sent`,
      response.data.messages[0].id
    ]);
    
    logRequest('POST', '/api/whatsapp/send-invoice', 200);
    res.json({
      success: true,
      message_id: response.data.messages[0].id,
      invoice_number: invoice.invoice_number,
      reminder_count: invoice.reminder_count + 1
    });
  } catch (error) {
    console.error('WhatsApp invoice send error:', error);
    logRequest('POST', '/api/whatsapp/send-invoice', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.sendInvoiceReminders = async (req, res) => {
  try {
    const invoicesResult = await pool.query(`
      SELECT i.*, l.phone_number, l.preferred_language, ai.id as agent_instance_id
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      JOIN agent_instances ai ON ai.company_id = (SELECT company_id FROM leads WHERE id = i.lead_id LIMIT 1)
      WHERE i.status = 'pending'
      AND i.due_date < NOW()
      AND (i.last_reminder_sent IS NULL OR i.last_reminder_sent < NOW() - INTERVAL '3 days')
      AND i.reminder_count < 5
      AND ai.agent_type = 'whatsapp'
      AND ai.is_active = TRUE
      LIMIT 50
    `);
    
    const results = [];
    const errors = [];
    
    for (const invoice of invoicesResult.rows) {
      try {
        const response = await axios.post(
          `${process.env.BASE_URL}/api/whatsapp/send-invoice`,
          {
            agent_instance_id: invoice.agent_instance_id,
            lead_phone: invoice.phone_number,
            invoice_id: invoice.id,
            include_payment_link: true
          }
        );
        
        results.push({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          status: 'sent'
        });
      } catch (error) {
        errors.push({
          invoice_id: invoice.id,
          error: error.message
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logRequest('POST', '/api/whatsapp/send-invoice-reminders', 200);
    res.json({
      success: true,
      sent: results.length,
      failed: errors.length,
      results,
      errors
    });
  } catch (error) {
    console.error('Invoice reminder batch error:', error);
    logRequest('POST', '/api/whatsapp/send-invoice-reminders', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};


// Parse user slot selection from WhatsApp message
function parseSlotSelection(messageText) {
  const patterns = [
    /^(\d+)$/,
    /slot\s*(\d+)/i,
    /book\s*(\d+)/i,
    /option\s*(\d+)/i,
    /number\s*(\d+)/i,
    /^(\d+)\./
  ];
  
  for (const pattern of patterns) {
    const match = messageText.match(pattern);
    if (match) {
      return parseInt(match[1]);
    }
  }
  
  return null;
}

// Handle appointment booking flow via WhatsApp
exports.handleBookingFlow = async (req, res) => {
  try {
    const {
      agent_instance_id,
      lead_phone,
      message_text
    } = req.body;
    
    if (!agent_instance_id || !lead_phone || !message_text) {
      return errorResponse(res, 'agent_instance_id, lead_phone, and message_text required', 400);
    }
    
    const slotNumber = parseSlotSelection(message_text);
    
    if (slotNumber) {
      const tableCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='conversations' AND column_name='metadata'
      `);
      
      if (tableCheck.rows.length === 0) {
        return successResponse(res, {
          success: false,
          message: 'Booking flow metadata not available. Please upgrade database schema.'
        });
      }

      const contextResult = await pool.query(`
        SELECT metadata
        FROM conversations
        WHERE phone_number = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [lead_phone]);
      
      if (contextResult.rows.length > 0) {
        const metadata = contextResult.rows[0].metadata || {};
        const pendingSlots = metadata.pending_appointment_slots;
        
        if (pendingSlots && pendingSlots.length >= slotNumber) {
          const selectedSlot = pendingSlots[slotNumber - 1];
          
          const bookingResponse = await axios.post(
            `${process.env.BASE_URL}/api/whatsapp/schedule-appointment`,
            {
              agent_instance_id,
              lead_phone,
              preferred_date: selectedSlot.start,
              duration_minutes: selectedSlot.duration_minutes || 60
            }
          );
          
          await pool.query(`
            UPDATE conversations
            SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{pending_appointment_slots}',
              '[]'::jsonb
            )
            WHERE phone_number = $1
          `, [lead_phone]);
          
          return successResponse(res, {
            slot_selected: slotNumber,
            booking_confirmed: true,
            booking_data: bookingResponse.data
          }, 'Booking confirmed successfully');
        }
      }
    }
    
    return successResponse(res, {
      slot_selected: null,
      booking_confirmed: false,
      message: 'Not a slot selection'
    });
    
  } catch (error) {
    logger.error('Booking flow error:', error);
    return errorResponse(res, error.message, 500);
  }
};

module.exports = exports;