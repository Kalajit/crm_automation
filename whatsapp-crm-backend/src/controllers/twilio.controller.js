const pool = require('../config/database');
const axios = require('axios');

global.twilioOAuthStates = global.twilioOAuthStates || new Map();

exports.startOAuth = async (req, res) => {
  try {
    const { company_id, agent_instance_id } = req.query;
    
    if (!company_id || !agent_instance_id) {
      return res.status(400).json({ error: 'company_id and agent_instance_id required' });
    }
    
    const stateToken = `twilio_${company_id}_${agent_instance_id}_${Date.now()}_${Math.random().toString(36)}`;
    
    global.twilioOAuthStates.set(stateToken, { company_id, agent_instance_id, expires: Date.now() + 600000 });
    
    const authUrl = `https://www.twilio.com/authorize/${process.env.TWILIO_APP_SID}?response_type=code&redirect_uri=${encodeURIComponent(process.env.BASE_URL + '/api/twilio/oauth/callback')}&scope=account&state=${stateToken}`;
    
    res.json({
      success: true,
      data: {
        auth_url: authUrl,
        state: stateToken,
        expires_in: 600
      }
    });
    
  } catch (error) {
    console.error('Twilio OAuth start error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.handleOAuthCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.status(400).send('Missing authorization code or state');
    }
    
    const stateData = global.twilioOAuthStates?.get(state);
    if (!stateData || stateData.expires < Date.now()) {
      return res.status(403).send('Invalid or expired state token');
    }
    
    const tokenResponse = await axios.post('https://api.twilio.com/2010-04-01/oauth/token', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.BASE_URL + '/api/twilio/oauth/callback',
        client_id: process.env.TWILIO_APP_SID,
        client_secret: process.env.TWILIO_APP_SECRET
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    const { account_sid, auth_token } = tokenResponse.data;
    
    const twilioClient = require('twilio')(account_sid, auth_token);
    const phoneNumbers = await twilioClient.incomingPhoneNumbers.list({ limit: 10 });
    
    if (phoneNumbers.length === 0) {
      return res.status(400).send('No phone numbers found in your Twilio account');
    }
    
    const phoneNumber = phoneNumbers[0].phoneNumber;
    const phoneNumberSid = phoneNumbers[0].sid;
    
    const verifyToken = `twilio_verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await pool.query(`
      UPDATE agent_instances
      SET 
        phone_number = $1,
        twilio_credentials = $2,
        twilio_webhook_verify_token = $3,
        twilio_token_expires_at = NOW() + INTERVAL '365 days',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND company_id = $5
    `, [
      phoneNumber,
      JSON.stringify({
        account_sid,
        auth_token,
        phone_number_sid: phoneNumberSid,
        phone_number: phoneNumber
      }),
      verifyToken,
      stateData.agent_instance_id,
      stateData.company_id
    ]);
    
    global.twilioOAuthStates.delete(state);
    
    res.send(`
      <html>
        <head><title>Twilio Connected</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>✅ Twilio Account Connected!</h1>
          <p><strong>Phone Number:</strong> ${phoneNumber}</p>
          <p><strong>Webhook URL:</strong><br><code>${process.env.BASE_URL}/api/twilio/voice-webhook</code></p>
          <p><strong>Verify Token:</strong><br><code>${verifyToken}</code></p>
          <hr>
          <h3>📋 Next Steps:</h3>
          <ol style="text-align: left; max-width: 600px; margin: 20px auto;">
            <li>Go to <a href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming" target="_blank">Twilio Console → Phone Numbers</a></li>
            <li>Click on <strong>${phoneNumber}</strong></li>
            <li>Under <strong>Voice & Fax</strong> → Configure with:
              <ul>
                <li><strong>A Call Comes In:</strong> Webhook</li>
                <li><strong>URL:</strong> <code>${process.env.BASE_URL}/api/twilio/voice-webhook</code></li>
                <li><strong>HTTP Method:</strong> POST</li>
              </ul>
            </li>
            <li>Click <strong>Save</strong></li>
          </ol>
          <button onclick="window.close()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">Close Window</button>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Twilio OAuth callback error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
};

exports.getOAuthStatus = async (req, res) => {
  try {
    const { agent_instance_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        phone_number,
        twilio_credentials,
        twilio_token_expires_at,
        EXTRACT(DAY FROM (twilio_token_expires_at - NOW())) as days_until_expiry
      FROM agent_instances
      WHERE id = $1
    `, [agent_instance_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent instance not found' });
    }
    
    const agent = result.rows[0];
    const isConnected = !!agent.twilio_credentials && Object.keys(agent.twilio_credentials).length > 0;
    
    res.json({
      success: true,
      data: {
        is_connected: isConnected,
        phone_number: agent.phone_number,
        days_until_expiry: agent.days_until_expiry ? parseInt(agent.days_until_expiry) : null,
        needs_renewal: agent.days_until_expiry < 30
      }
    });
    
  } catch (error) {
    console.error('Twilio status check error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.disconnectOAuth = async (req, res) => {
  try {
    const { agent_instance_id } = req.params;
    
    await pool.query(`
      UPDATE agent_instances
      SET 
        phone_number = NULL,
        twilio_credentials = '{}'::jsonb,
        twilio_webhook_verify_token = NULL,
        twilio_token_expires_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [agent_instance_id]);
    
    res.json({ success: true, message: 'Twilio account disconnected' });
    
  } catch (error) {
    console.error('Twilio disconnect error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.handleVoiceWebhook = async (req, res) => {
  try {
    const { To, From, CallSid } = req.body;
    
    console.log(`📞 Inbound call: ${From} → ${To} (SID: ${CallSid})`);
    
    const agentResult = await pool.query(`
      SELECT 
        ai.id,
        ai.company_id,
        ai.agent_name,
        ai.custom_prompt,
        ai.custom_voice,
        ai.twilio_credentials,
        ac.prompt_preamble,
        ac.initial_message,
        ac.voice as default_voice,
        c.name as company_name
      FROM agent_instances ai
      LEFT JOIN agent_configs ac ON ai.agent_config_id = ac.id
      LEFT JOIN companies c ON ai.company_id = c.id
      WHERE ai.phone_number = $1 
        AND ai.agent_type = 'voice' 
        AND ai.is_active = TRUE
    `, [To]);
    
    const VoiceResponse = require('twilio').twiml.VoiceResponse;
    const response = new VoiceResponse();
    
    if (agentResult.rows.length === 0) {
      console.log('⚠️ Unknown phone number:', To);
      response.say('Sorry, this number is not configured. Please contact support.');
      return res.type('text/xml').send(response.toString());
    }
    
    const agentInstance = agentResult.rows[0];
    const credentials = agentInstance.twilio_credentials;
    
    const fastApiUrl = process.env.FASTAPI_URL || 'https://call-automation-kxow.onrender.com';
    
    await axios.post(`${fastApiUrl}/api/inbound-call-webhook`, {
      call_sid: CallSid,
      from_phone: From,
      to_phone: To,
      agent_instance_id: agentInstance.id,
      company_id: agentInstance.company_id,
      custom_prompt: agentInstance.custom_prompt || agentInstance.prompt_preamble,
      voice: agentInstance.custom_voice || agentInstance.default_voice,
      credentials: credentials
    });
    
    response.say(`Hello, you've reached ${agentInstance.company_name}. Connecting you to our AI assistant.`);
    response.redirect(`${fastApiUrl}/inbound_call`);
    
    res.type('text/xml').send(response.toString());
    
  } catch (error) {
    console.error('❌ Voice webhook error:', error);
    
    const VoiceResponse = require('twilio').twiml.VoiceResponse;
    const response = new VoiceResponse();
    response.say('An error occurred. Please try again later.');
    res.type('text/xml').send(response.toString());
  }
};