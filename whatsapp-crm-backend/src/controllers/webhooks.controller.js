const pool = require('../config/database');
const { detectLanguage } = require('../services/whatsapp/translation.service');
const { broadcastToCall } = require('../websocket/callUpdates');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');
const axios = require('axios');

/**
 * Handle n8n webhook with all custom fields
 */
exports.handleN8nWebhook = async (req, res) => {
  try {
    const { 
      phone_number, 
      name, 
      lead_source, 
      message_body, 
      message_id,
      conversation_history,
      interest_level,
      chess_rating,
      location,
      tournament_experience,
      coaching_experience,
      education_certs,
      availability,
      age_group_pref,
      ai_summary,
      timestamp
    } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    // Detect language from message
    const detectedLanguage = await detectLanguage(message_body || '');
    
    // Check if language switch requested
    const languageChanged = detectedLanguage !== 'en';

    // 1. Create or update lead with all custom fields
    let leadId;
    let leadQuery = `SELECT id FROM leads WHERE phone_number = $1;`;
    let leadResult = await pool.query(leadQuery, [phone_number]);

    if (leadResult.rows.length === 0) {
      const createLead = `
        INSERT INTO leads (
          phone_number, name, lead_source, interest_level,
          chess_rating, location, tournament_experience, coaching_experience,
          education_certs, availability, age_group_pref, last_contacted,
          preferred_language
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id;
      `;
      leadResult = await pool.query(createLead, [
        phone_number, 
        name, 
        lead_source || 'whatsapp', 
        interest_level || 1,
        chess_rating || null,
        location || null,
        tournament_experience || null,
        coaching_experience || null,
        education_certs || null,
        availability || null,
        age_group_pref || null,
        new Date().toISOString(),
        detectedLanguage
      ]);
    } else {
      // Update existing lead
      const updateLead = `
        UPDATE leads
        SET 
          name = COALESCE($2, name),
          interest_level = COALESCE($3, interest_level),
          chess_rating = COALESCE($4, chess_rating),
          location = COALESCE($5, location),
          tournament_experience = COALESCE($6, tournament_experience),
          coaching_experience = COALESCE($7, coaching_experience),
          education_certs = COALESCE($8, education_certs),
          availability = COALESCE($9, availability),
          age_group_pref = COALESCE($10, age_group_pref),
          last_contacted = $11,
          preferred_language = CASE WHEN $12 != 'en' THEN $12 ELSE preferred_language END,
          updated_at = CURRENT_TIMESTAMP
        WHERE phone_number = $1
        RETURNING id;
      `;
      leadResult = await pool.query(updateLead, [
        phone_number,
        name,
        interest_level,
        chess_rating,
        location,
        tournament_experience,
        coaching_experience,
        education_certs,
        availability,
        age_group_pref,
        new Date().toISOString(),
        detectedLanguage
      ]);
    }
    leadId = leadResult.rows[0].id;

    // 2. Get or create conversation
    let convQuery = `SELECT id FROM conversations WHERE lead_id = $1;`;
    let convResult = await pool.query(convQuery, [leadId]);

    let convId;
    if (convResult.rows.length === 0) {
      const createConv = `
        INSERT INTO conversations (lead_id, phone_number, conversation_history)
        VALUES ($1, $2, $3)
        RETURNING id;
      `;
      convResult = await pool.query(createConv, [leadId, phone_number, conversation_history || '']);
      convId = convResult.rows[0].id;
    } else {
      convId = convResult.rows[0].id;
      
      // Update conversation history if provided
      if (conversation_history) {
        await pool.query(
          `UPDATE conversations 
           SET conversation_history = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [conversation_history, convId]
        );
      }
    }

    // 3. Store message - Handle duplicate message_id
    if (message_body) {
      // Check if message already exists
      const msgCheck = await pool.query(
        'SELECT id FROM whatsapp_messages WHERE message_id = $1',
        [message_id]
      );

      if (msgCheck.rows.length === 0) {
        // Only insert if message doesn't exist
        await pool.query(
          `INSERT INTO whatsapp_messages 
           (conversation_id, lead_id, phone_number, message_type, message_body, sender, message_id, is_from_user)
           VALUES ($1, $2, $3, 'text', $4, 'bot', $5, FALSE);`,
          [convId, leadId, phone_number, message_body, message_id || `msg_${Date.now()}`]
        );
      }
    }

    // 4. Update conversation summary if AI summary provided
    if (ai_summary) {
      await pool.query(
        `UPDATE conversations
         SET ai_summary = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2;`,
        [ai_summary, convId]
      );
    }

    logRequest('POST', '/api/webhook/n8n', 200);
    res.json({ 
      success: true, 
      message: 'Data synced successfully',
      lead_id: leadId,
      conversation_id: convId
    });
  } catch (error) {
    console.error('Webhook error:', error);
    logRequest('POST', '/api/webhook/n8n', 500);
    handleError(res, error);
  }
};

/**
 * Handle call completed webhook
 */
exports.handleCallCompleted = async (req, res) => {
  try {
    const { 
      lead_id, 
      call_sid,
      transcript,
      sentiment,
      summary,
      recording_url,
      duration,
      to_phone,
      name,
      call_type
    } = req.body;
    
    if (!call_sid) {
      return res.status(400).json({ error: 'call_sid is required' });
    }
    
    // 1. Update call log in database
    const updateResult = await pool.query(`
      UPDATE call_logs
      SET 
        call_status = 'completed',
        call_duration = $1,
        transcript = $2,
        sentiment = $3,
        summary = $4,
        recording_url = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE call_sid = $6
      RETURNING *
    `, [duration, transcript, JSON.stringify(sentiment), JSON.stringify(summary), recording_url, call_sid]);
    
    // Check if call log exists
    if (updateResult.rows.length === 0) {
      console.warn(`Call log not found for call_sid: ${call_sid}`);
    }
    
    // 2. Update lead status
    if (lead_id) {
      const new_status = summary?.intent === 'interested' ? 'qualified' : 'contacted';
      await pool.query(`
        UPDATE leads
        SET 
          lead_status = $1,
          interest_level = $2,
          last_contacted = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [new_status, sentiment?.tone_score || 5, lead_id]);
    }
    
    // 3. Save conversation
    if (lead_id && to_phone) {
      const convCheck = await pool.query('SELECT id FROM conversations WHERE lead_id = $1', [lead_id]);
      
      if (convCheck.rows.length > 0) {
        await pool.query(`
          UPDATE conversations
          SET 
            conversation_history = $1,
            sentiment = $2,
            ai_summary = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE lead_id = $4
        `, [transcript, sentiment?.sentiment, summary?.summary, lead_id]);
      } else {
        await pool.query(`
          INSERT INTO conversations (lead_id, phone_number, conversation_history, sentiment, ai_summary)
          VALUES ($1, $2, $3, $4, $5)
        `, [lead_id, to_phone, transcript, sentiment?.sentiment, summary?.summary]);
      }
    }

    // Broadcast WebSocket update
    broadcastToCall(call_sid, {
      type: 'call_completed',
      call_sid,
      status: 'completed',
      summary: summary,
      sentiment: sentiment,
      timestamp: new Date().toISOString()
    });
    
    logRequest('POST', '/api/webhook/call-completed', 200);
    res.json({ 
      success: true, 
      message: 'Call completion processed',
      lead_id,
      call_sid 
    });
  } catch (error) {
    console.error('Call completed webhook error:', error);
    logRequest('POST', '/api/webhook/call-completed', 500);
    handleError(res, error);
  }
};

/**
 * Handle call failed webhook
 */
exports.handleCallFailed = async (req, res) => {
  try {
    const { lead_id, call_sid, error, company_id, call_type } = req.body;
    
    if (!call_sid) {
      return res.status(400).json({ error: 'call_sid is required' });
    }
    
    // Update call log
    await pool.query(`
      UPDATE call_logs
      SET 
        call_status = 'failed',
        updated_at = CURRENT_TIMESTAMP
      WHERE call_sid = $1
    `, [call_sid]);
    
    // Update lead status
    if (lead_id) {
      await pool.query(`
        UPDATE leads
        SET 
          lead_status = 'call_failed',
          notes = COALESCE(notes || E'\n', '') || $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [`Call failed: ${error}`, lead_id]);
    }
    
    logRequest('POST', '/api/webhook/call-failed', 200);
    res.json({ 
      success: true, 
      message: 'Call failure processed',
      lead_id,
      call_sid 
    });
  } catch (error) {
    logRequest('POST', '/api/webhook/call-failed', 500);
    handleError(res, error);
  }
};





exports.handleLeadCapture = async (req, res) => {
  const apiKey = req.header('X-API-Key');
  
  if (apiKey !== process.env.LEAD_WEBHOOK_KEY) {
    logRequest('POST', '/api/webhook/lead-capture', 401);
    return res.status(401).json({ success: false, error: 'Invalid API key' });
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const input = req.body;

    if (!input.phone && !input.phone_number) {
      throw new Error('Phone number is required');
    }

    if (!input.company_id) {
      throw new Error('company_id is required');
    }

    let phone = (input.phone || input.phone_number).replace(/\D/g, '');
    if (phone.length === 10) phone = `+91${phone}`;
    else if (!phone.startsWith('+')) phone = `+${phone}`;

    const source = input.source || input.lead_source || 'unknown';
    const newTags = [source];
    if (input.campaign) newTags.push(input.campaign.toLowerCase().replace(/\s+/g, '_'));
    if (input.utm_campaign) newTags.push(input.utm_campaign);

    const cf = input.form_fields || {};
    const customFields = {
      chess_rating: cf.chess_rating || cf.rating || null,
      location: cf.location || cf.area || null,
      coaching_experience: cf.coaching_experience || null,
      availability: cf.availability || null,
      age_group_pref: cf.age_group_pref || null
    };

    const metadata = {
      source_details: {
        campaign: input.campaign || input.utm_campaign || null,
        ad_id: input.ad_id || null,
        form_id: input.form_id || null,
        utm_source: input.utm_source || null,
        utm_medium: input.utm_medium || null,
        utm_content: input.utm_content || null
      },
      captured_at: new Date().toISOString(),
      ip_address: req.ip.includes('::ffff:') ? req.ip.split(':').pop() : req.ip,
      user_agent: req.get('User-Agent') || null
    };

    const payload = {
      phone_number: phone,
      name: input.name || input.full_name || 'New Lead',
      email: input.email || null,
      lead_source: source,
      company_id: input.company_id,
      tags: newTags,
      custom_fields: customFields,
      metadata
    };

    const { rows: [existing] } = await client.query(
      'SELECT id, tags, metadata FROM leads WHERE phone_number = $1 LIMIT 1',
      [phone]
    );

    let lead;
    
    if (existing) {
      const existingTags = existing.tags || [];
      const mergedTags = Array.from(new Set([...existingTags, ...payload.tags]));

      const { rows } = await client.query(
        `UPDATE leads
         SET 
           name = COALESCE($1, name),
           email = COALESCE($2, email),
           tags = $3,
           metadata = metadata || $4::jsonb,
           last_contacted = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           chess_rating = COALESCE($5, chess_rating),
           location = COALESCE($6, location),
           coaching_experience = COALESCE($7, coaching_experience),
           availability = COALESCE($8, availability),
           age_group_pref = COALESCE($9, age_group_pref)
         WHERE phone_number = $10
         RETURNING *`,
        [
          payload.name,
          payload.email,
          mergedTags,
          JSON.stringify(payload.metadata),
          customFields.chess_rating,
          customFields.location,
          customFields.coaching_experience,
          customFields.availability,
          customFields.age_group_pref,
          phone
        ]
      );
      lead = rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO leads (
          company_id, phone_number, name, email, lead_source,
          lead_status, interest_level, tags, metadata,
          chess_rating, location, coaching_experience,
          availability, age_group_pref
        ) VALUES (
          $1, $2, $3, $4, $5, 'new', 1, $6, $7, $8, $9, $10, $11, $12
        ) RETURNING *`,
        [
          payload.company_id,
          phone,
          payload.name,
          payload.email,
          payload.lead_source,
          payload.tags,
          JSON.stringify(payload.metadata),
          customFields.chess_rating,
          customFields.location,
          customFields.coaching_experience,
          customFields.availability,
          customFields.age_group_pref
        ]
      );
      lead = rows[0];
    }

    await client.query(
      `INSERT INTO conversations (lead_id, phone_number, conversation_history, message_count)
       VALUES ($1, $2, '', 0)
       ON CONFLICT (lead_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [lead.id, phone]
    );

    const firstName = (lead.name || 'there').trim().split(' ')[0];
    const welcomeMsg = `Hi ${firstName}! Thanks for your interest in chess coaching. We'll contact you within 24 hours.`;
    
    await client.query(
      `INSERT INTO notifications (
        lead_id, phone_number, notification_type, title, message,
        delivery_channel, scheduled_time, status
      ) VALUES ($1, $2, 'welcome', 'Welcome to 4champz!', $3, 'whatsapp', CURRENT_TIMESTAMP, 'pending')`,
      [lead.id, phone, welcomeMsg]
    );

    await client.query(
      `INSERT INTO scheduled_calls (company_id, lead_id, call_type, scheduled_time, status)
       VALUES ($1, $2, 'qualification', $3, 'pending')`,
      [lead.company_id, lead.id, new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()]
    );

    await client.query(
      `INSERT INTO analytics_events (event_name, lead_id, company_id, event_properties)
       VALUES ('lead_captured', $1, $2, $3)`,
      [lead.id, lead.company_id, JSON.stringify(payload.metadata)]
    );

    await client.query('COMMIT');

    logRequest('POST', '/api/webhook/lead-capture', 200);
    res.json({
      success: true,
      lead_id: lead.id,
      phone_number: lead.phone_number,
      message: 'Lead captured successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logRequest('POST', '/api/webhook/lead-capture', 400);
    res.status(400).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};







exports.handleMetaLeadsWebhook = async (req, res) => {
  try {
    const { token } = req.params;
    const rawData = req.body;
    
    console.log('📥 Meta webhook received:', JSON.stringify(rawData, null, 2));
    
    // Handle webhook verification
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token']) {
      const verifyToken = req.query['hub.verify_token'];
      
      if (verifyToken === token || verifyToken === process.env.META_WEBHOOK_VERIFY_TOKEN) {
        return res.send(req.query['hub.challenge']);
      }
      return res.status(403).send('Invalid verify token');
    }
    
    const configResult = await pool.query(
      `SELECT * FROM lead_source_configs WHERE webhook_url LIKE $1 AND is_active = TRUE`,
      [`%${token}%`]
    );
    
    if (configResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid webhook token' });
    }
    
    const config = configResult.rows[0];
    const { company_id, form_id, field_mappings } = config;
    
    const entry = rawData.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    
    if (!value || !value.leadgen_id) {
      return res.json({ success: true, message: 'No lead data' });
    }
    
    const credResult = await pool.query(
      'SELECT access_token FROM oauth_credentials WHERE company_id = $1 AND platform = $2',
      [company_id, 'meta']
    );
    
    if (credResult.rows.length === 0) {
      throw new Error('Meta OAuth credentials not found');
    }
    
    const access_token = credResult.rows[0].access_token;
    
    const leadResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${value.leadgen_id}`,
      {
        params: {
          access_token: access_token,
          fields: 'id,created_time,field_data,ad_id,form_id'
        }
      }
    );
    
    const leadData = leadResponse.data;
    const fieldData = leadData.field_data || [];
    
    const mappedData = {};
    fieldData.forEach(field => {
      const crmField = field_mappings[field.name] || field.name;
      mappedData[crmField] = field.values?.[0] || '';
    });
    
    if (!mappedData.phone_number && !mappedData.email) {
      throw new Error('No contact information in Meta lead');
    }
    
    let phone = mappedData.phone_number;
    if (phone) {
      phone = phone.replace(/\D/g, '');
      if (phone.length === 10) phone = '+91' + phone;
      else if (!phone.startsWith('+')) phone = '+' + phone;
    }
    
    let leadId;
    const existingLead = await pool.query(
      'SELECT id FROM leads WHERE (phone_number = $1 OR email = $2) AND company_id = $3',
      [phone, mappedData.email, company_id]
    );
    
    if (existingLead.rows.length > 0) {
      leadId = existingLead.rows[0].id;
      await pool.query(`
        UPDATE leads
        SET 
          name = COALESCE($1, name),
          email = COALESCE($2, email),
          lead_source = 'meta_ads',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [mappedData.name, mappedData.email, leadId]);
    } else {
      const newLead = await pool.query(`
        INSERT INTO leads (
          company_id, phone_number, name, email,
          lead_source, lead_source_config_id, metadata
        )
        VALUES ($1, $2, $3, $4, 'meta_ads', $5, $6)
        RETURNING id
      `, [
        company_id,
        phone,
        mappedData.name || 'Meta Lead',
        mappedData.email,
        config.id,
        JSON.stringify({ meta: leadData })
      ]);
      leadId = newLead.rows[0].id;
    }
    
    await pool.query(`
      INSERT INTO lead_import_logs (
        company_id, platform, lead_id, form_id,
        raw_data, mapped_data, status
      )
      VALUES ($1, 'meta', $2, $3, $4, $5, 'success')
    `, [
      company_id,
      leadId,
      form_id,
      JSON.stringify(rawData),
      JSON.stringify(mappedData)
    ]);
    
    console.log(`✅ Meta lead captured: ${leadId}`);
    res.json({ success: true, lead_id: leadId });
  } catch (error) {
    console.error('Meta webhook error:', error);
    
    try {
      await pool.query(`
        INSERT INTO lead_import_logs (
          company_id, platform, form_id, raw_data, status, error_message
        )
        VALUES (0, 'meta', 'unknown', $1, 'failed', $2)
      `, [JSON.stringify(req.body), error.message]);
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// UNIFIED LEAD CAPTURE WEBHOOK
// ============================================

exports.handleUnifiedLeadCapture = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { token } = req.params;
    const rawData = req.body;

    console.log('📥 Webhook received:', { token, platform: 'detecting...', rawData });

    const configResult = await client.query(
      `SELECT * FROM lead_source_configs 
       WHERE webhook_url LIKE $1 AND is_active = TRUE`,
      [`%${token}%`]
    );

    if (configResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.error('❌ Invalid webhook token:', token);
      return res.status(404).json({ error: 'Invalid webhook token' });
    }

    const config = configResult.rows[0];
    const { company_id, platform, field_mappings } = config;

    console.log('✅ Config found:', { company_id, platform, form_id: config.form_id });
    console.log('🗺️ Field mappings:', field_mappings);

    // Check and refresh OAuth token if needed (non-blocking)
    try {
      const refreshedToken = await checkAndRefreshToken(company_id, platform);
      if (refreshedToken) {
        console.log(`🔄 Using refreshed token for ${platform}`);
      } else {
        console.warn(`⚠️ Token refresh failed for ${platform}, proceeding with existing token`);
      }
    } catch (tokenError) {
      console.warn(`⚠️ Token check error for ${platform}:`, tokenError.message);
    }

    // Parse platform-specific data
    let leadData = {};

    if (platform === 'meta') {
      const entry = rawData.entry?.[0];
      const value = entry?.changes?.[0]?.value;

      if (value?.field_data) {
        value.field_data.forEach(field => {
          const crmField = field_mappings[field.name];
          if (crmField) {
            leadData[crmField] = field.values[0];
            console.log(`📌 Mapped: ${field.name} → ${crmField} = ${field.values[0]}`);
          }
        });
      }
    } else if (platform === 'google_ads') {
      Object.keys(rawData).forEach(key => {
        const crmField = field_mappings[key];
        if (crmField) {
          leadData[crmField] = rawData[key];
          console.log(`📌 Mapped: ${key} → ${crmField} = ${rawData[key]}`);
        }
      });
      
      if (!leadData.phone_number && !leadData.phone) {
        if (rawData.phone_number) leadData.phone_number = rawData.phone_number;
        if (rawData.phone) leadData.phone_number = rawData.phone;
      }
      if (!leadData.name && rawData.full_name) {
        leadData.name = rawData.full_name;
      }
      if (!leadData.email && rawData.email) {
        leadData.email = rawData.email;
      }
    } else if (platform === 'linkedin') {
      rawData.answers?.forEach(answer => {
        const crmField = field_mappings[answer.questionId];
        if (crmField) {
          leadData[crmField] =
            answer.answerDetails?.textQuestionAnswer ||
            answer.answerDetails?.value;
          console.log(`📌 Mapped: ${answer.questionId} → ${crmField} = ${leadData[crmField]}`);
        }
      });

      if (!leadData.phone_number && !leadData.phone) {
        rawData.answers?.forEach(answer => {
          if (answer.questionId.toLowerCase().includes('phone')) {
            leadData.phone_number = answer.answerDetails?.textQuestionAnswer || answer.answerDetails?.value;
          }
        });
      }
    }

    console.log('📊 Mapped lead data:', leadData);

    // Normalize phone
    let phone = leadData.phone_number || leadData.phone;
    if (!phone) {
      console.error('❌ Phone number missing in mapped data:', leadData);
      throw new Error('Phone number is required. Please check field mappings.');
    }

    phone = phone.replace(/\D/g, '');
    if (phone.length === 10) phone = `+91${phone}`;
    else if (!phone.startsWith('+')) phone = `+${phone}`;

    console.log('📞 Normalized phone:', phone);

    // Check if lead exists
    const existingLead = await client.query(
      'SELECT id, tags FROM leads WHERE phone_number = $1',
      [phone]
    );

    let leadId;

    if (existingLead.rows.length > 0) {
      console.log('🔄 Updating existing lead:', existingLead.rows[0].id);
      const lead = existingLead.rows[0];
      const newTags = Array.from(
        new Set([...(lead.tags || []), platform, config.form_name])
      );

      const updateResult = await client.query(
        `UPDATE leads
        SET 
          name = COALESCE($1, name),
          email = COALESCE($2, email),
          lead_source = $3,
          tags = $4,
          lead_source_config_id = $5,
          metadata = metadata || $6::jsonb,
          last_contacted = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE phone_number = $7
        RETURNING id`,
        [
          leadData.name,
          leadData.email,
          platform,
          newTags,
          config.id,
          JSON.stringify({ [platform]: rawData }),
          phone
        ]
      );

      leadId = updateResult.rows[0].id;

      await client.query(
        `INSERT INTO lead_import_logs (
          company_id, platform, lead_id, form_id,
          raw_data, mapped_data, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'duplicate')`,
        [
          company_id,
          platform,
          leadId,
          config.form_id,
          JSON.stringify(rawData),
          JSON.stringify(leadData)
        ]
      );
      console.log('✅ Lead updated:', leadId);
    } else {
      console.log('➕ Creating new lead');
      const insertResult = await client.query(
        `INSERT INTO leads (
          company_id, phone_number, name, email,
          lead_source, lead_status, tags, 
          lead_source_config_id, metadata
        )
        VALUES ($1, $2, $3, $4, $5, 'new', $6, $7, $8)
        RETURNING id`,
        [
          company_id,
          phone,
          leadData.name || 'New Lead',
          leadData.email,
          platform,
          [platform, config.form_name],
          config.id,
          JSON.stringify({ [platform]: rawData })
        ]
      );

      leadId = insertResult.rows[0].id;
      console.log('✅ Lead created:', leadId);

      await client.query(
        `INSERT INTO lead_import_logs (
          company_id, platform, lead_id, form_id,
          raw_data, mapped_data, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'success')`,
        [
          company_id,
          platform,
          leadId,
          config.form_id,
          JSON.stringify(rawData),
          JSON.stringify(leadData)
        ]
      );

      try {
        await client.query(
          `INSERT INTO conversations (lead_id, phone_number, conversation_history)
          VALUES ($1, $2, '')`,
          [leadId, phone]
        );
        console.log('✅ Conversation created');
      } catch (convError) {
        if (convError.code === '23505') {
          console.log('ℹ️ Conversation already exists');
        } else {
          throw convError;
        }
      }

      await client.query(
        `INSERT INTO notifications (
          lead_id, phone_number, notification_type, title, message,
          delivery_channel, scheduled_time, status
        )
        VALUES ($1, $2, 'welcome', 'Welcome!', $3, 'whatsapp',
        CURRENT_TIMESTAMP, 'pending')`,
        [
          leadId,
          phone,
          `Hi ${leadData.name || 'there'}! Thanks for your interest. We'll contact you soon.`
        ]
      );

      console.log('✅ Welcome notification queued');

      await client.query(
        `INSERT INTO scheduled_calls (
          company_id, lead_id, call_type, scheduled_time, status
        )
        VALUES ($1, $2, 'qualification', $3, 'pending')`,
        [
          company_id,
          leadId,
          new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        ]
      );
      console.log('✅ Follow-up call scheduled');
    }

    await client.query('COMMIT');
    console.log('🎉 Webhook processed successfully:', { lead_id: leadId, phone });
    res.json({ 
      success: true, 
      lead_id: leadId,
      phone_number: phone,
      status: existingLead.rows.length > 0 ? 'updated' : 'created'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Lead capture error:', error);

    try {
      await pool.query(
        `INSERT INTO lead_import_logs (
          company_id, platform, form_id, raw_data,
          status, error_message
        )
        VALUES ($1, 'unknown', 'unknown', $2, 'failed', $3)`,
        [0, JSON.stringify(req.body), error.message]
      );
      console.log('📝 Error logged to lead_import_logs');
    } catch (e) {
      console.error('Failed to log error:', e);
    }

    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// Helper function for token refresh
async function checkAndRefreshToken(company_id, platform) {
  try {
    const result = await pool.query(
      'SELECT * FROM oauth_credentials WHERE company_id = $1 AND platform = $2',
      [company_id, platform]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`No OAuth credentials for ${platform}`);
    }
    
    const creds = result.rows[0];
    const now = new Date();
    const expiresAt = new Date(creds.token_expires_at);
    
    if (expiresAt - now < 7 * 24 * 60 * 60 * 1000) {
      console.log(`⚠️ Token expiring soon for ${platform}, refreshing...`);
      
      if (platform === 'google_ads' && creds.refresh_token) {
        const tokenResponse = await axios.post(
          'https://oauth2.googleapis.com/token',
          {
            refresh_token: creds.refresh_token,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            grant_type: 'refresh_token'
          }
        );
        
        const { access_token, expires_in } = tokenResponse.data;
        
        await pool.query(`
          UPDATE oauth_credentials
          SET 
            access_token = $1,
            token_expires_at = NOW() + INTERVAL '${expires_in} seconds',
            updated_at = CURRENT_TIMESTAMP
          WHERE company_id = $2 AND platform = $3
        `, [access_token, company_id, platform]);
        
        console.log(`✅ Token refreshed for ${platform}`);
        return access_token;
      }
      
      if (platform === 'meta' || platform === 'linkedin') {
        console.warn(`⚠️ ${platform} token expiring soon. User needs to re-authorize.`);
      }
    }
    
    return creds.access_token;
  } catch (error) {
    console.error(`❌ Token check/refresh failed for ${platform}:`, error.message);
    return null;
  }
}