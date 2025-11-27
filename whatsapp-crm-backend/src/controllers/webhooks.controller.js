const pool = require('../config/database');
const { detectLanguage } = require('../services/whatsapp/translation.service');
const { broadcastToCall } = require('../websocket/callUpdates');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

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