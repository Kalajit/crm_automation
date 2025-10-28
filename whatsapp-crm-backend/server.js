
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
require('dotenv').config();

const app = express();



// Translation function using Google Translate API
async function translateText(text, targetLang, sourceLang = 'en') {
  if (targetLang === sourceLang || !text) return text;
  
  try {
    // Primary: LibreTranslate
    const response = await axios.post(`${LIBRETRANSLATE_URL}/translate`, {
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text'
    }, { timeout: 10000 });
    
    const translated = response.data.translatedText;
    
    if (translated && translated !== text) {
      console.log(`LibreTranslate: ${text.substring(0, 50)}... → ${translated.substring(0, 50)}...`);
      return translated;
    }
    
  } catch (error) {
    console.error('LibreTranslate error:', error.message);
    
    // Fallback: DeepL (if API key set)
    if (DEEPL_API_KEY) {
      try {
        const deepl = require('deepl-node');
        const translator = new deepl.Translator(DEEPL_API_KEY);
        const result = await translator.translateText(text, sourceLang, targetLang);
        console.log(`DeepL fallback used: ${text.substring(0, 50)}...`);
        return result.text;
      } catch (deeplError) {
        console.error('DeepL fallback error:', deeplError.message);
      }
    }
  }
  
  // Ultimate fallback: return original
  console.warn(`Translation failed, returning original: ${text.substring(0, 50)}...`);
  return text;
}




/**
 * Detect language from text using Unicode ranges + keywords
 * (No external API needed, instant detection)
 */
function detectLanguage(text) {
  const lowerText = text.toLowerCase();
  
  // Keyword-based detection
  if (lowerText.includes('hindi') || lowerText.includes('हिंदी') || /[\u0900-\u097F]/.test(text)) {
    return 'hi';
  }
  
  if (lowerText.includes('kannada') || lowerText.includes('ಕನ್ನಡ') || /[\u0C80-\u0CFF]/.test(text)) {
    return 'kn';
  }
  
  if (lowerText.includes('malayalam') || lowerText.includes('മലയാളം') || /[\u0D00-\u0D7F]/.test(text)) {
    return 'ml';
  }
  
  if (lowerText.includes('tamil') || lowerText.includes('தமிழ்') || /[\u0B80-\u0BFF]/.test(text)) {
    return 'ta';
  }
  
  if (lowerText.includes('telugu') || lowerText.includes('తెలుగు') || /[\u0C00-\u0C7F]/.test(text)) {
    return 'te';
  }
  
  return 'en';
}


// LibreTranslate Configuration
const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || 'http://libretranslate:5000';

// Optional: DeepL Configuration
const DEEPL_API_KEY = process.env.DEEPL_API_KEY || null;


// ============================================
// MIDDLEWARE
// ============================================

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*'
}));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// ============================================
// DATABASE CONNECTION
// ============================================

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

console.log(`✓ Database configured: ${process.env.DB_NAME}`);

// ============================================
// UTILITY FUNCTIONS
// ============================================

const logRequest = (method, path, status) => {
  console.log(`[${new Date().toISOString()}] ${method} ${path} - ${status}`);
};

const handleError = (res, error, statusCode = 500) => {
  console.error('Error:', error);
  res.status(statusCode).json({ 
    success: false, 
    error: error.message || 'Internal Server Error' 
  });
};

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  logRequest('GET', '/health', 200);
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});


app.get('/api/health', async (req, res) => {
  try {
    // Check database connection
    const dbCheck = await pool.query('SELECT NOW()');
    
    // Check active connections
    const activeConns = await pool.query(`
      SELECT count(*) as active 
      FROM pg_stat_activity 
      WHERE datname = $1 AND state = 'active';
    `, [process.env.DB_NAME]);
    
    logRequest('GET', '/api/health', 200);
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        timestamp: dbCheck.rows[0].now,
        active_connections: parseInt(activeConns.rows[0].active)
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    logRequest('GET', '/api/health', 500);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// ============================================
// 1. LEAD MANAGEMENT ENDPOINTS
// ============================================


app.get('/api/leads', async (req, res) => {
  try {
    const { status, limit } = req.query;
    
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    
    if (status) {
      params.push(status);
      query += ` AND lead_status = $${params.length}`;
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }
    
    const result = await pool.query(query, params);
    
    logRequest('GET', '/api/leads', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/leads', 500);
    handleError(res, error);
  }
});


// Create or update a lead
app.post('/api/leads', async (req, res) => {
  try {
    const { 
      phone_number, 
      name, 
      email, 
      lead_source, 
      interest_level, 
      chess_rating,
      location,
      tournament_experience,
      coaching_experience,
      education_certs,
      availability,
      age_group_pref,
      conversation_history,
      last_contacted,
      notes,
      tags 
    } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    const query = `
      INSERT INTO leads (
        phone_number, name, email, lead_source, interest_level,
        chess_rating, location, tournament_experience, coaching_experience,
        education_certs, availability, age_group_pref, last_contacted, notes, tags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (phone_number) DO UPDATE
      SET 
        name = COALESCE(EXCLUDED.name, leads.name),
        email = COALESCE(EXCLUDED.email, leads.email),
        interest_level = COALESCE(EXCLUDED.interest_level, leads.interest_level),
        chess_rating = COALESCE(EXCLUDED.chess_rating, leads.chess_rating),
        location = COALESCE(EXCLUDED.location, leads.location),
        tournament_experience = COALESCE(EXCLUDED.tournament_experience, leads.tournament_experience),
        coaching_experience = COALESCE(EXCLUDED.coaching_experience, leads.coaching_experience),
        education_certs = COALESCE(EXCLUDED.education_certs, leads.education_certs),
        availability = COALESCE(EXCLUDED.availability, leads.availability),
        age_group_pref = COALESCE(EXCLUDED.age_group_pref, leads.age_group_pref),
        last_contacted = COALESCE(EXCLUDED.last_contacted, leads.last_contacted),
        notes = COALESCE(EXCLUDED.notes, leads.notes),
        tags = COALESCE(EXCLUDED.tags, leads.tags),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const result = await pool.query(query, [
      phone_number,
      name || null,
      email || null,
      lead_source || 'whatsapp',
      interest_level || 1,
      chess_rating || null,
      location || null,
      tournament_experience || null,
      coaching_experience || null,
      education_certs || null,
      availability || null,
      age_group_pref || null,
      last_contacted || new Date().toISOString(),
      notes || null,
      tags ? JSON.stringify(tags) : null,
    ]);

    // If conversation_history provided, update conversations table
    if (conversation_history && result.rows[0].id) {
      const leadId = result.rows[0].id;
      
      // Check if conversation exists
      const convCheck = await pool.query(
        `SELECT id FROM conversations WHERE lead_id = $1`,
        [leadId]
      );

      if (convCheck.rows.length > 0) {
        // Update existing conversation
        await pool.query(
          `UPDATE conversations 
           SET conversation_history = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE lead_id = $2`,
          [conversation_history, leadId]
        );
      } else {
        // Create new conversation
        await pool.query(
          `INSERT INTO conversations (lead_id, phone_number, conversation_history) 
           VALUES ($1, $2, $3)`,
          [leadId, phone_number, conversation_history]
        );
      }
    }

    logRequest('POST', '/api/leads', 201);
    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logRequest('POST', '/api/leads', 500);
    handleError(res, error);
  }
});


app.patch('/api/leads/:lead_id', async (req, res) => {
  try {
    const { lead_id } = req.params;
    const { lead_status, interest_level, last_contacted, notes } = req.body;
    
    const updates = [];
    const params = [];
    
    if (lead_status) {
      params.push(lead_status);
      updates.push(`lead_status = $${params.length}`);
    }
    
    if (interest_level) {
      params.push(interest_level);
      updates.push(`interest_level = $${params.length}`);
    }
    
    if (last_contacted) {
      params.push(last_contacted);
      updates.push(`last_contacted = $${params.length}`);
    }
    
    if (notes) {
      params.push(notes);
      updates.push(`notes = $${params.length}`);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(lead_id);
    
    const query = `
      UPDATE leads
      SET ${updates.join(', ')}
      WHERE id = $${params.length}
      RETURNING *;
    `;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    
    logRequest('PATCH', `/api/leads/${lead_id}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/leads/${lead_id}`, 500);
    handleError(res, error);
  }
});

// Get lead by phone number
// Get lead by phone number
app.get('/api/leads/:phone', async (req, res) => {
  const { phone } = req.params;

  try {
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone parameter is required' });
    }

    // Query DB
    const query = `SELECT * FROM leads WHERE phone_number = $1;`;
    const result = await pool.query(query, [phone]);

    // Always return 200 OK
    if (result.rows.length === 0) {
      logRequest('GET', `/api/leads/${phone}`, 200);
      return res.json({ success: false, data: null, message: 'Lead not found' });
    }

    // Lead found
    logRequest('GET', `/api/leads/${phone}`, 200);
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/leads/${phone}`, 500);
    return res.status(500).json({ success: false, error: error.message });
  }
});


// Update lead interest level
app.patch('/api/leads/:phone/interest', async (req, res) => {
  try {
    const { phone } = req.params;
    const { interest_level } = req.body;

    if (!interest_level || interest_level < 1 || interest_level > 10) {
      return res.status(400).json({ error: 'interest_level must be between 1 and 10' });
    }

    const query = `
      UPDATE leads
      SET interest_level = $1, updated_at = CURRENT_TIMESTAMP
      WHERE phone_number = $2
      RETURNING *;
    `;

    const result = await pool.query(query, [interest_level, phone]);

    if (result.rows.length === 0) {
      logRequest('PATCH', `/api/leads/${phone}/interest`, 404);
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    logRequest('PATCH', `/api/leads/${phone}/interest`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/leads/${phone}/interest`, 500);
    handleError(res, error);
  }
});



app.post('/api/leads/bulk', async (req, res) => {
  try {
    const { leads } = req.body;
    
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'leads array is required' });
    }
    
    const results = [];
    const errors = [];
    
    for (const lead of leads) {
      try {
        // FIX: Handle missing phone_number
        if (!lead.phone_number) {
          errors.push({ lead: lead, error: 'phone_number is required' });
          continue;
        }

        const query = `
          INSERT INTO leads (
            phone_number, name, email, lead_source, company_id,
            chess_rating, location, interest_level
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (phone_number) DO UPDATE
          SET 
            name = COALESCE(EXCLUDED.name, leads.name),
            email = COALESCE(EXCLUDED.email, leads.email),
            updated_at = CURRENT_TIMESTAMP
          RETURNING *;
        `;
        
        const result = await pool.query(query, [
          lead.phone_number,
          lead.name || null,
          lead.email || null,
          lead.lead_source || 'import',
          lead.company_id || null,
          lead.chess_rating || null,
          lead.location || null,
          lead.interest_level || 1
        ]);
        
        results.push(result.rows[0]);
      } catch (error) {
        console.error(`Error importing lead ${lead.phone_number}:`, error.message);
        errors.push({ phone: lead.phone_number, error: error.message });
      }
    }
    
    logRequest('POST', '/api/leads/bulk', 200);
    res.json({ 
      success: true, 
      imported: results.length,
      failed: errors.length,
      data: results,
      errors: errors
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    logRequest('POST', '/api/leads/bulk', 500);
    handleError(res, error);
  }
});


app.get('/api/search/leads', async (req, res) => {
  try {
    const { query: searchQuery, status, source } = req.query;

    let query = `SELECT * FROM leads WHERE 1=1`;
    const params = [];
    let paramCount = 0;

    if (searchQuery) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR phone_number ILIKE $${paramCount})`;
      params.push(`%${searchQuery}%`);
    }

    if (status) {
      paramCount++;
      query += ` AND lead_status = $${paramCount}`;
      params.push(status);
    }

    if (source) {
      paramCount++;
      query += ` AND lead_source = $${paramCount}`;
      params.push(source);
    }

    query += ` ORDER BY updated_at DESC LIMIT 50;`;

    const result = await pool.query(query, params);

    logRequest('GET', '/api/search/leads', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/search/leads', 500);
    handleError(res, error);
  }
});




// ============================================
// 2. CONVERSATION ENDPOINTS
// ============================================

// Get or create conversation
app.post('/api/conversations', async (req, res) => {
  try {
    const { lead_id, phone_number } = req.body;

    if (!lead_id || !phone_number) {
      return res.status(400).json({ error: 'lead_id and phone_number are required' });
    }

    let query = `SELECT * FROM conversations WHERE lead_id = $1 AND phone_number = $2;`;
    let result = await pool.query(query, [lead_id, phone_number]);

    if (result.rows.length === 0) {
      const createQuery = `
        INSERT INTO conversations (lead_id, phone_number, conversation_history)
        VALUES ($1, $2, '')
        RETURNING *;
      `;
      result = await pool.query(createQuery, [lead_id, phone_number]);
      logRequest('POST', '/api/conversations', 201);
    } else {
      logRequest('POST', '/api/conversations', 200);
    }

    res.status(result.rows.length > 0 ? 200 : 201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logRequest('POST', '/api/conversations', 500);
    handleError(res, error);
  }
});

// Get conversation history
app.get('/api/conversations/:phone', async (req, res) => {
  try {
    const { phone } = req.params;

    const query = `
      SELECT 
        c.*,
        l.name,
        l.email,
        l.lead_status,
        l.chess_rating,
        l.location
      FROM conversations c
      JOIN leads l ON c.lead_id = l.id
      WHERE c.phone_number = $1
      ORDER BY c.updated_at DESC
      LIMIT 1;
    `;

    const result = await pool.query(query, [phone]);

    if (result.rows.length === 0) {
      logRequest('GET', `/api/conversations/${phone}`, 200);
      return res.json({ 
        success: false, 
        data: {
          conversation_history: '',
          message_count: 0
        },
        message: 'Conversation not found' 
      });
    }

    logRequest('GET', `/api/conversations/${phone}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/conversations/${phone}`, 500);
    handleError(res, error);
  }
});

// ============================================
// 3. MESSAGE ENDPOINTS
// ============================================

// Store incoming WhatsApp message
app.post('/api/messages', async (req, res) => {
  try {
    const { conversation_id, lead_id, phone_number, message_type, message_body, message_id, sender } = req.body;

    if (!conversation_id || !lead_id || !message_body) {
      return res.status(400).json({ error: 'conversation_id, lead_id, and message_body are required' });
    }

    const query = `
      INSERT INTO whatsapp_messages 
      (conversation_id, lead_id, phone_number, message_type, message_body, sender, message_id, is_from_user)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      conversation_id,
      lead_id,
      phone_number,
      message_type || 'text',
      message_body,
      sender || 'user',
      message_id || null,
      sender === 'user' ? true : false,
    ]);

    // Update conversation's last message
    await pool.query(
      `UPDATE conversations 
       SET last_message = $1, last_message_timestamp = CURRENT_TIMESTAMP, message_count = message_count + 1
       WHERE id = $2;`,
      [message_body, conversation_id]
    );

    logRequest('POST', '/api/messages', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/messages', 500);
    handleError(res, error);
  }
});

// Get messages for a conversation
app.get('/api/messages/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const limit = req.query.limit || 50;

    const query = `
      SELECT * FROM whatsapp_messages
      WHERE phone_number = $1
      ORDER BY timestamp DESC
      LIMIT $2;
    `;

    const result = await pool.query(query, [phone, limit]);

    logRequest('GET', `/api/messages/${phone}`, 200);
    res.json({ success: true, data: result.rows.reverse() });
  } catch (error) {
    logRequest('GET', `/api/messages/${phone}`, 500);
    handleError(res, error);
  }
});

// ============================================
// 4. FAQ ENDPOINTS
// ============================================

// Get all active FAQs
app.get('/api/faqs', async (req, res) => {
  try {
    const query = `
      SELECT * FROM faq_templates
      WHERE is_active = TRUE
      ORDER BY priority DESC;
    `;

    const result = await pool.query(query);

    logRequest('GET', '/api/faqs', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/faqs', 500);
    handleError(res, error);
  }
});

// Create FAQ
app.post('/api/faqs', async (req, res) => {
  try {
    const { question, answer, category, keywords, priority } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: 'question and answer are required' });
    }

    // FIX: Handle keywords as array directly (not JSON string)
    const query = `
      INSERT INTO faq_templates (question, answer, category, keywords, priority)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      question,
      answer,
      category || 'general',
      keywords || null,  // Pass array directly, not JSON.stringify
      priority || 1,
    ]);

    logRequest('POST', '/api/faqs', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/faqs', 500);
    handleError(res, error);
  }
});


// ============================================
// 5. BOOKING ENDPOINTS
// ============================================

// Create booking
app.post('/api/bookings', async (req, res) => {
  try {
    const { lead_id, phone_number, booking_type, scheduled_date, duration_minutes, location } = req.body;

    if (!lead_id || !scheduled_date) {
      return res.status(400).json({ error: 'lead_id and scheduled_date are required' });
    }

    const query = `
      INSERT INTO bookings (lead_id, phone_number, booking_type, scheduled_date, duration_minutes, location)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      lead_id,
      phone_number,
      booking_type,
      scheduled_date,
      duration_minutes || 30,
      location,
    ]);

    logRequest('POST', '/api/bookings', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/bookings', 500);
    handleError(res, error);
  }
});

// Get bookings for a lead
app.get('/api/bookings/lead/:lead_id', async (req, res) => {
  try {
    const { lead_id } = req.params;

    const query = `
      SELECT * FROM bookings
      WHERE lead_id = $1
      ORDER BY scheduled_date DESC;
    `;

    const result = await pool.query(query, [lead_id]);

    logRequest('GET', `/api/bookings/lead/${lead_id}`, 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/bookings/lead/${lead_id}`, 500);
    handleError(res, error);
  }
});

// ============================================
// 6. INVOICE ENDPOINTS
// ============================================

// Create invoice
app.post('/api/invoices', async (req, res) => {
  try {
    const { lead_id, phone_number, invoice_number, amount, currency, invoice_type, due_date } = req.body;

    if (!lead_id || !invoice_number || !amount) {
      return res.status(400).json({ error: 'lead_id, invoice_number, and amount are required' });
    }

    const query = `
      INSERT INTO invoices 
      (lead_id, phone_number, invoice_number, amount, currency, invoice_type, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      lead_id,
      phone_number,
      invoice_number,
      amount,
      currency || 'INR',
      invoice_type || 'one_time',
      due_date,
    ]);

    logRequest('POST', '/api/invoices', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/invoices', 500);
    handleError(res, error);
  }
});

// Get invoices for a lead
app.get('/api/invoices/lead/:lead_id', async (req, res) => {
  try {
    const { lead_id } = req.params;

    const query = `
      SELECT * FROM invoices
      WHERE lead_id = $1
      ORDER BY created_at DESC;
    `;

    const result = await pool.query(query, [lead_id]);

    logRequest('GET', `/api/invoices/lead/${lead_id}`, 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/invoices/lead/${lead_id}`, 500);
    handleError(res, error);
  }
});




// ============================================
// 3. GET ACTIVE CALLS (for duplicate prevention)
// ============================================
app.get('/api/active-calls', async (req, res) => {
  try {
    const query = `
      SELECT 
        call_sid,
        lead_id,
        to_phone,
        call_type,
        call_status,
        created_at
      FROM call_logs
      WHERE call_status IN ('initiated', 'in-progress', 'ringing')
      AND created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC;
    `;
    
    const result = await pool.query(query);
    
    logRequest('GET', '/api/active-calls', 200);
    res.json({ 
      success: true, 
      count: result.rows.length,
      calls: result.rows 
    });
  } catch (error) {
    logRequest('GET', '/api/active-calls', 500);
    handleError(res, error);
  }
});





// ============================================
// 7. WEBHOOK ENDPOINT (FROM n8n)
// ============================================

// Webhook to receive data from n8n workflow
// Webhook to receive data from n8n workflow with ALL custom fields
app.post('/api/webhook/n8n', async (req, res) => {
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
    const detectedLanguage = detectLanguage(message_body || '');
    
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

    // 3. Store message - FIX: Handle duplicate message_id
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
});





app.post('/api/webhook/call-completed', async (req, res) => {
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
      // Don't fail, just log warning
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
});

// ============================================
// 5. WEBHOOK: CALL FAILED (from Python)
// ============================================
app.post('/api/webhook/call-failed', async (req, res) => {
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
});





// ============================================
// 8. NOTIFICATION ENDPOINTS
// ============================================

// Create notification
app.post('/api/notifications', async (req, res) => {
  try {
    const { lead_id, phone_number, notification_type, title, message, scheduled_time, delivery_channel } = req.body;

    if (!lead_id || !title || !message) {
      return res.status(400).json({ error: 'lead_id, title, and message are required' });
    }

    const query = `
      INSERT INTO notifications 
      (lead_id, phone_number, notification_type, title, message, scheduled_time, delivery_channel)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      lead_id,
      phone_number,
      notification_type,
      title,
      message,
      scheduled_time,
      delivery_channel || 'whatsapp',
    ]);

    logRequest('POST', '/api/notifications', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/notifications', 500);
    handleError(res, error);
  }
});

// Get pending notifications
app.get('/api/notifications/pending/:phone', async (req, res) => {
  try {
    const { phone } = req.params;

    const query = `
      SELECT * FROM notifications
      WHERE phone_number = $1 AND status = 'pending'
      ORDER BY scheduled_time ASC;
    `;

    const result = await pool.query(query, [phone]);

    logRequest('GET', `/api/notifications/pending/${phone}`, 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/notifications/pending/${phone}`, 500);
    handleError(res, error);
  }
});


// Add to server.js
app.get('/api/notifications/pending/all', async (req, res) => {
  try {
    const now = new Date();
    
    const query = `
      SELECT n.*, l.name, l.phone_number 
      FROM notifications n
      JOIN leads l ON n.lead_id = l.id
      WHERE n.status = 'pending'
      AND n.scheduled_time <= $1
      ORDER BY n.scheduled_time ASC;
    `;

    const result = await pool.query(query, [now]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// Add to server.js
app.patch('/api/notifications/:id/sent', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, sent_at } = req.body;

    // FIX: Remove updated_at - notifications table doesn't have it
    const query = `
      UPDATE notifications
      SET status = $1, sent_at = $2
      WHERE id = $3
      RETURNING *;
    `;

    const result = await pool.query(query, [status, sent_at, id]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// ============================================
// 9. DASHBOARD STATS ENDPOINTS
// ============================================

// Get dashboard metrics
app.get('/api/stats/dashboard', async (req, res) => {
  try {
    const stats = {};

    // Total leads
    const leadsResult = await pool.query('SELECT COUNT(*) FROM leads;');
    stats.total_leads = parseInt(leadsResult.rows[0].count);

    // Leads by status
    const statusResult = await pool.query(`
      SELECT lead_status, COUNT(*) as count FROM leads 
      GROUP BY lead_status;
    `);
    stats.leads_by_status = statusResult.rows;

    // Average interest level
    const interestResult = await pool.query(`
      SELECT AVG(interest_level) as avg_interest FROM leads;
    `);
    stats.avg_interest_level = parseFloat(interestResult.rows[0].avg_interest || 0).toFixed(2);

    // Conversations count
    const convResult = await pool.query('SELECT COUNT(*) FROM conversations;');
    stats.total_conversations = parseInt(convResult.rows[0].count);

    // Messages count
    const msgResult = await pool.query('SELECT COUNT(*) FROM whatsapp_messages;');
    stats.total_messages = parseInt(msgResult.rows[0].count);

    // Pending invoices
    const invoiceResult = await pool.query(`
      SELECT COUNT(*) FROM invoices WHERE status = 'pending';
    `);
    stats.pending_invoices = parseInt(invoiceResult.rows[0].count);

    // Pending bookings
    const bookingResult = await pool.query(`
      SELECT COUNT(*) FROM bookings WHERE status = 'pending';
    `);
    stats.pending_bookings = parseInt(bookingResult.rows[0].count);

    logRequest('GET', '/api/stats/dashboard', 200);
    res.json({ success: true, data: stats });
  } catch (error) {
    logRequest('GET', '/api/stats/dashboard', 500);
    handleError(res, error);
  }
});

// Get lead metrics
app.get('/api/stats/leads', async (req, res) => {
  try {
    const query = `
      SELECT 
        lead_status,
        COUNT(*) as count,
        AVG(interest_level) as avg_interest,
        MAX(updated_at) as last_updated
      FROM leads
      GROUP BY lead_status;
    `;

    const result = await pool.query(query);

    logRequest('GET', '/api/stats/leads', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/stats/leads', 500);
    handleError(res, error);
  }
});

// Get message metrics
app.get('/api/stats/messages', async (req, res) => {
  try {
    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as message_count,
        COUNT(DISTINCT lead_id) as unique_leads
      FROM whatsapp_messages
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) DESC
      LIMIT 30;
    `;

    const result = await pool.query(query);

    logRequest('GET', '/api/stats/messages', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/stats/messages', 500);
    handleError(res, error);
  }
});



app.get('/api/metrics/dashboard', async (req, res) => {
  try {
    const metrics = {};
    
    // Total calls by type
    const callsResult = await pool.query(`
      SELECT 
        call_type,
        call_status,
        COUNT(*) as count,
        AVG(call_duration) as avg_duration
      FROM call_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY call_type, call_status;
    `);
    metrics.calls_24h = callsResult.rows;
    
    // Sentiment distribution
    const sentimentResult = await pool.query(`
      SELECT 
        sentiment->>'sentiment' as sentiment_type,
        COUNT(*) as count
      FROM call_logs
      WHERE sentiment IS NOT NULL
      AND created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY sentiment->>'sentiment';
    `);
    metrics.sentiment_distribution = sentimentResult.rows;
    
    // Lead conversion stats
    const leadsResult = await pool.query(`
      SELECT 
        lead_status,
        COUNT(*) as count
      FROM leads
      WHERE updated_at >= NOW() - INTERVAL '24 hours'
      GROUP BY lead_status;
    `);
    metrics.lead_status_24h = leadsResult.rows;
    
    // Active calls
    const activeResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM call_logs
      WHERE call_status IN ('initiated', 'in-progress', 'ringing')
      AND created_at >= NOW() - INTERVAL '1 hour';
    `);
    metrics.active_calls = parseInt(activeResult.rows[0].count);
    
    // Success rate
    const successResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE call_status = 'completed') as completed,
        COUNT(*) FILTER (WHERE call_status = 'failed') as failed,
        COUNT(*) as total
      FROM call_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours';
    `);
    const success = successResult.rows[0];
    metrics.success_rate = success.total > 0 
      ? ((success.completed / success.total) * 100).toFixed(2) 
      : 0;
    
    logRequest('GET', '/api/metrics/dashboard', 200);
    res.json({ success: true, data: metrics });
  } catch (error) {
    logRequest('GET', '/api/metrics/dashboard', 500);
    handleError(res, error);
  }
});








// Add to server.js
app.patch('/api/leads/:phone/last-contacted', async (req, res) => {
  try {
    const { phone } = req.params;
    const { last_contacted } = req.body;

    const query = `
      UPDATE leads
      SET last_contacted = $1, updated_at = CURRENT_TIMESTAMP
      WHERE phone_number = $2
      RETURNING *;
    `;

    const result = await pool.query(query, [last_contacted, phone]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




// ============================================
// LANGUAGE PREFERENCE ENDPOINTS
// ============================================

// Get lead's language preference
app.get('/api/leads/:phone/language', async (req, res) => {
  try {
    const { phone } = req.params;
    
    const query = `
      SELECT preferred_language 
      FROM leads 
      WHERE phone_number = $1;
    `;
    
    const result = await pool.query(query, [phone]);
    
    if (result.rows.length === 0) {
      return res.json({ success: true, language: 'en' }); // Default
    }
    
    logRequest('GET', `/api/leads/${phone}/language`, 200);
    res.json({ success: true, language: result.rows[0].preferred_language || 'en' });
  } catch (error) {
    logRequest('GET', `/api/leads/${phone}/language`, 500);
    handleError(res, error);
  }
});

// Update lead's language preference
app.patch('/api/leads/:phone/language', async (req, res) => {
  try {
    const { phone } = req.params;
    const { language } = req.body;
    
    if (!['en', 'hi', 'kn', 'ml'].includes(language)) {
      return res.status(400).json({ error: 'Invalid language code' });
    }
    
    const query = `
      UPDATE leads
      SET preferred_language = $1, updated_at = CURRENT_TIMESTAMP
      WHERE phone_number = $2
      RETURNING *;
    `;
    
    const result = await pool.query(query, [language, phone]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    
    logRequest('PATCH', `/api/leads/${phone}/language`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/leads/${phone}/language`, 500);
    handleError(res, error);
  }
});




// ============================================
// 10. AUDIT LOG ENDPOINTS
// ============================================

// Create audit log
app.post('/api/audit-log', async (req, res) => {
  try {
    const { lead_id, action, details, created_by } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }

    const query = `
      INSERT INTO audit_logs (lead_id, action, details, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      lead_id,
      action,
      details ? JSON.stringify(details) : null,
      created_by || 'system',
    ]);

    logRequest('POST', '/api/audit-log', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/audit-log', 500);
    handleError(res, error);
  }
});

// ============================================
// 11. BULK OPERATIONS
// ============================================

// Bulk update lead interest
app.post('/api/leads/bulk-update-interest', async (req, res) => {
  try {
    const { phone_numbers, interest_level } = req.body;

    if (!phone_numbers || !Array.isArray(phone_numbers) || phone_numbers.length === 0) {
      return res.status(400).json({ error: 'phone_numbers array is required' });
    }

    if (!interest_level || interest_level < 1 || interest_level > 10) {
      return res.status(400).json({ error: 'interest_level must be between 1 and 10' });
    }

    const query = `
      UPDATE leads
      SET interest_level = $1, updated_at = CURRENT_TIMESTAMP
      WHERE phone_number = ANY($2)
      RETURNING *;
    `;

    const result = await pool.query(query, [interest_level, phone_numbers]);

    logRequest('POST', '/api/leads/bulk-update-interest', 200);
    res.json({ 
      success: true, 
      updated_count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    logRequest('POST', '/api/leads/bulk-update-interest', 500);
    handleError(res, error);
  }
});

// ============================================
// 12. SEARCH ENDPOINTS
// ============================================

// Search leads
app.get('/api/search/leads', async (req, res) => {
  try {
    const { query: searchQuery, status, source } = req.query;

    let query = `SELECT * FROM leads WHERE 1=1`;
    const params = [];

    if (searchQuery) {
      query += ` AND (name ILIKE ${params.length + 1} OR phone_number ILIKE ${params.length + 1})`;
      params.push(`%${searchQuery}%`);
    }

    if (status) {
      query += ` AND lead_status = ${params.length + 1}`;
      params.push(status);
    }

    if (source) {
      query += ` AND lead_source = ${params.length + 1}`;
      params.push(source);
    }

    query += ` ORDER BY updated_at DESC LIMIT 50;`;

    const result = await pool.query(query, params);

    logRequest('GET', '/api/search/leads', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/search/leads', 500);
    handleError(res, error);
  }
});













// ============================================
// AI CALLING ENDPOINTS
// ============================================

// 1. Create Company (for multi-tenant)
app.post('/api/companies', async (req, res) => {
  try {
    const { name, phone_number } = req.body;
    const query = `
      INSERT INTO companies (name, phone_number)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const result = await pool.query(query, [name, phone_number]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
});



app.get('/api/companies', async (req, res) => {
  try {
    const query = 'SELECT * FROM companies ORDER BY created_at DESC;';
    const result = await pool.query(query);
    
    logRequest('GET', '/api/companies', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/companies', 500);
    handleError(res, error);
  }
});

// ============================================
// 7. GET COMPANY BY ID
// ============================================
app.get('/api/companies/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    const query = 'SELECT * FROM companies WHERE id = $1;';
    const result = await pool.query(query, [company_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }
    
    logRequest('GET', `/api/companies/${company_id}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/companies/${company_id}`, 500);
    handleError(res, error);
  }
});




// 2. Create/Update Agent Config
app.post('/api/agent-configs', async (req, res) => {
  try {
    const { company_id, prompt_key, prompt_preamble, initial_message, voice } = req.body;
    const query = `
      INSERT INTO agent_configs (company_id, prompt_key, prompt_preamble, initial_message, voice)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (company_id, prompt_key) DO UPDATE
      SET prompt_preamble = EXCLUDED.prompt_preamble,
          initial_message = EXCLUDED.initial_message,
          voice = EXCLUDED.voice,
          updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const result = await pool.query(query, [company_id, prompt_key, prompt_preamble, initial_message, voice]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
});

// 3. Get Agent Config by Company
app.get('/api/agent-configs/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    const query = `SELECT * FROM agent_configs WHERE company_id = $1 AND is_active = TRUE;`;
    const result = await pool.query(query, [company_id]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    handleError(res, error);
  }
});



// ============================================
// AGENT INSTANCES ENDPOINTS (CLOSERX-LIKE)
// ============================================

// Create Agent Instance
app.post('/api/agent-instances', async (req, res) => {
  try {
    const { 
      company_id, 
      agent_name, 
      agent_type, 
      phone_number, 
      whatsapp_number,
      agent_config_id,
      custom_prompt,
      custom_voice,
      metadata
    } = req.body;

    if (!company_id || !agent_name || !agent_type) {
      return res.status(400).json({ error: 'company_id, agent_name, and agent_type are required' });
    }

    const query = `
      INSERT INTO agent_instances 
      (company_id, agent_name, agent_type, phone_number, whatsapp_number, agent_config_id, custom_prompt, custom_voice, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      company_id,
      agent_name,
      agent_type,
      phone_number || null,
      whatsapp_number || null,
      agent_config_id || null,
      custom_prompt || null,
      custom_voice || null,
      metadata ? JSON.stringify(metadata) : null
    ]);

    logRequest('POST', '/api/agent-instances', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/agent-instances', 500);
    handleError(res, error);
  }
});

// Get All Agent Instances for a Company
app.get('/api/agent-instances/company/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    const { agent_type } = req.query;

    let query = `
      SELECT ai.*, ac.prompt_key, ac.voice as default_voice, ac.model_name
      FROM agent_instances ai
      LEFT JOIN agent_configs ac ON ai.agent_config_id = ac.id
      WHERE ai.company_id = $1
    `;
    
    const params = [company_id];
    
    if (agent_type) {
      query += ` AND ai.agent_type = $2`;
      params.push(agent_type);
    }
    
    query += ` ORDER BY ai.created_at DESC;`;

    const result = await pool.query(query, params);

    logRequest('GET', `/api/agent-instances/company/${company_id}`, 200);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/agent-instances/company/${company_id}`, 500);
    handleError(res, error);
  }
});

// Get Single Agent Instance
app.get('/api/agent-instances/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT ai.*, ac.prompt_preamble, ac.initial_message, ac.voice as default_voice, ac.model_name
      FROM agent_instances ai
      LEFT JOIN agent_configs ac ON ai.agent_config_id = ac.id
      WHERE ai.id = $1;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent instance not found' });
    }

    logRequest('GET', `/api/agent-instances/${id}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/agent-instances/${id}`, 500);
    handleError(res, error);
  }
});

// Update Agent Instance
app.patch('/api/agent-instances/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      agent_name, 
      phone_number, 
      whatsapp_number,
      custom_prompt,
      custom_voice,
      is_active,
      metadata
    } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 0;

    if (agent_name) {
      paramCount++;
      updates.push(`agent_name = $${paramCount}`);
      params.push(agent_name);
    }

    if (phone_number !== undefined) {
      paramCount++;
      updates.push(`phone_number = $${paramCount}`);
      params.push(phone_number);
    }

    if (whatsapp_number !== undefined) {
      paramCount++;
      updates.push(`whatsapp_number = $${paramCount}`);
      params.push(whatsapp_number);
    }

    if (custom_prompt !== undefined) {
      paramCount++;
      updates.push(`custom_prompt = $${paramCount}`);
      params.push(custom_prompt);
    }

    if (custom_voice !== undefined) {
      paramCount++;
      updates.push(`custom_voice = $${paramCount}`);
      params.push(custom_voice);
    }

    if (is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      params.push(is_active);
    }

    if (metadata) {
      paramCount++;
      updates.push(`metadata = $${paramCount}`);
      params.push(JSON.stringify(metadata));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(id);

    const query = `
      UPDATE agent_instances
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent instance not found' });
    }

    logRequest('PATCH', `/api/agent-instances/${id}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/agent-instances/${id}`, 500);
    handleError(res, error);
  }
});

// Delete Agent Instance
app.delete('/api/agent-instances/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `DELETE FROM agent_instances WHERE id = $1 RETURNING *;`;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent instance not found' });
    }

    logRequest('DELETE', `/api/agent-instances/${id}`, 200);
    res.json({ success: true, message: 'Agent instance deleted', data: result.rows[0] });
  } catch (error) {
    logRequest('DELETE', `/api/agent-instances/${id}`, 500);
    handleError(res, error);
  }
});

// Get Agent Instance by Phone Number (for routing incoming calls/messages)
app.get('/api/agent-instances/phone/:phone', async (req, res) => {
  try {
    const { phone } = req.params;

    const query = `
      SELECT ai.*, ac.prompt_preamble, ac.initial_message, ac.voice as default_voice, ac.model_name, c.name as company_name
      FROM agent_instances ai
      LEFT JOIN agent_configs ac ON ai.agent_config_id = ac.id
      LEFT JOIN companies c ON ai.company_id = c.id
      WHERE (ai.phone_number = $1 OR ai.whatsapp_number = $1)
      AND ai.is_active = TRUE
      LIMIT 1;
    `;

    const result = await pool.query(query, [phone]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No active agent found for this number' });
    }

    logRequest('GET', `/api/agent-instances/phone/${phone}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/agent-instances/phone/${phone}`, 500);
    handleError(res, error);
  }
});



// 4. Schedule Call (from n8n or manual)
app.post('/api/schedule-call', async (req, res) => {
  try {
    const { company_id, lead_id, call_type, scheduled_time } = req.body;
    const query = `
      INSERT INTO scheduled_calls (company_id, lead_id, call_type, scheduled_time)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await pool.query(query, [company_id, lead_id, call_type, scheduled_time]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
});

// 5. Get Pending Scheduled Calls (for scheduler)
app.get('/api/scheduled-calls/pending', async (req, res) => {
  try {
    const query = `
      SELECT sc.*, l.phone_number, l.name, ac.prompt_key, ac.initial_message, ac.voice
      FROM scheduled_calls sc
      JOIN leads l ON sc.lead_id = l.id
      JOIN agent_configs ac ON sc.company_id = ac.company_id
      WHERE sc.status = 'pending' AND sc.scheduled_time <= NOW()
      ORDER BY sc.scheduled_time ASC;
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    handleError(res, error);
  }
});



app.patch('/api/scheduled-calls/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, call_sid } = req.body;  
    
    let query;
    let params;
    
    if (status === 'called' && call_sid) {
      query = `
        UPDATE scheduled_calls
        SET status = $1, call_sid = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *;
      `;
      params = [status, call_sid, id];
    } else if (status === 'failed') {
      query = `
        UPDATE scheduled_calls
        SET status = $1, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
      `;
      params = [status, id];
    } else {
      query = `
        UPDATE scheduled_calls
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
      `;
      params = [status, id];
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Scheduled call not found' });
    }
    
    logRequest('PATCH', `/api/scheduled-calls/${id}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/scheduled-calls/${id}`, 500);
    handleError(res, error);
  }
});




// 6. Create Call Log (from Python after call)
app.post('/api/call-logs', async (req, res) => {
  try {
    const { company_id, lead_id, call_sid, to_phone, from_phone, call_type, call_status, transcript, sentiment, summary, conversation_history, recording_url } = req.body;
    const query = `
      INSERT INTO call_logs (company_id, lead_id, call_sid, to_phone, from_phone, call_type, call_status, transcript, sentiment, summary, conversation_history, recording_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    const result = await pool.query(query, [company_id, lead_id, call_sid, to_phone, from_phone, call_type, call_status, transcript, sentiment ? JSON.stringify(sentiment) : null, summary ? JSON.stringify(summary) : null, conversation_history ? JSON.stringify(conversation_history) : null, recording_url]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
});

// 7. Update Call Log (status, transcript, etc.)
app.patch('/api/call-logs/:call_sid', async (req, res) => {
  try {
    const { call_sid } = req.params;
    const { call_status, call_duration, transcript, sentiment, summary, recording_url } = req.body;
    const query = `
      UPDATE call_logs
      SET call_status = COALESCE($1, call_status),
          call_duration = COALESCE($2, call_duration),
          transcript = COALESCE($3, transcript),
          sentiment = COALESCE($4, sentiment),
          summary = COALESCE($5, summary),
          recording_url = COALESCE($6, recording_url),
          updated_at = CURRENT_TIMESTAMP
      WHERE call_sid = $7
      RETURNING *;
    `;
    const result = await pool.query(query, [call_status, call_duration, transcript, sentiment ? JSON.stringify(sentiment) : null, summary ? JSON.stringify(summary) : null, recording_url, call_sid]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
});

// 8. Get Call Logs by Lead
app.get('/api/call-logs/lead/:lead_id', async (req, res) => {
  try {
    const { lead_id } = req.params;
    const query = `SELECT * FROM call_logs WHERE lead_id = $1 ORDER BY created_at DESC;`;
    const result = await pool.query(query, [lead_id]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    handleError(res, error);
  }
});



app.get('/api/call-logs', async (req, res) => {
  try {
    const { company_id, call_type, call_status, limit } = req.query;
    
    let query = 'SELECT * FROM call_logs WHERE 1=1';
    const params = [];
    
    if (company_id) {
      params.push(parseInt(company_id));  // Convert to integer
      query += ` AND company_id = $${params.length}`;  // FIX: Use $1 not 1
    }
    
    if (call_type) {
      params.push(call_type);
      query += ` AND call_type = $${params.length}`;  // FIX: Use $2 not 2
    }
    
    if (call_status) {
      params.push(call_status);
      query += ` AND call_status = $${params.length}`;  // FIX: Use $3 not 3
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;  // FIX: Use $4 not 4
    } else {
      query += ' LIMIT 100';
    }
    
    const result = await pool.query(query, params);
    
    logRequest('GET', '/api/call-logs', 200);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/call-logs', 500);
    handleError(res, error);
  }
});



app.get('/api/call-logs/:call_sid', async (req, res) => {
  try {
    const { call_sid } = req.params;
    const query = 'SELECT * FROM call_logs WHERE call_sid = $1;';
    const result = await pool.query(query, [call_sid]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Call log not found' });
    }
    
    logRequest('GET', `/api/call-logs/${call_sid}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/call-logs/${call_sid}`, 500);
    handleError(res, error);
  }
});



// ============================================
// 10. GET CALL LOG BY CALL_SID
// ============================================
app.get('/api/call-logs/sid/:call_sid', async (req, res) => {
  try {
    const { call_sid } = req.params;
    const query = 'SELECT * FROM call_logs WHERE call_sid = $1;';
    const result = await pool.query(query, [call_sid]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Call log not found' });
    }
    
    logRequest('GET', `/api/call-logs/sid/${call_sid}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/call-logs/sid/${call_sid}`, 500);
    handleError(res, error);
  }
});


app.get('/api/call-logs/export/csv', async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    let query = `
      SELECT 
        cl.call_sid,
        cl.to_phone,
        cl.from_phone,
        cl.call_type,
        cl.call_status,
        cl.call_duration,
        cl.created_at,
        cl.sentiment->>'sentiment' as sentiment,
        cl.sentiment->>'tone_score' as tone_score,
        cl.summary->>'intent' as intent,
        cl.summary->>'summary' as summary_text,
        l.name as lead_name,
        l.email as lead_email,
        c.name as company_name
      FROM call_logs cl
      LEFT JOIN leads l ON cl.lead_id = l.id
      LEFT JOIN companies c ON cl.company_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (company_id) {
      params.push(parseInt(company_id));  // Convert to integer
      query += ` AND cl.company_id = $${params.length}`;  // FIX: Use $1 not 1
    }
    
    if (start_date) {
      params.push(start_date);
      query += ` AND cl.created_at >= $${params.length}::timestamp`;  // FIX: Cast to timestamp
    }
    
    if (end_date) {
      params.push(end_date);
      query += ` AND cl.created_at <= $${params.length}::timestamp`;  // FIX: Cast to timestamp
    }
    
    query += ' ORDER BY cl.created_at DESC;';
    
    const result = await pool.query(query, params);
    
    // Convert to CSV
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No data to export' });
    }
    
    const headers = Object.keys(result.rows[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of result.rows) {
      const values = headers.map(header => {
        const val = row[header];
        return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
      });
      csvRows.push(values.join(','));
    }
    
    const csv = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="call_logs_${Date.now()}.csv"`);
    res.send(csv);
    
    logRequest('GET', '/api/call-logs/export/csv', 200);
  } catch (error) {
    logRequest('GET', '/api/call-logs/export/csv', 500);
    handleError(res, error);
  }
});






// Create a simple notifications table endpoint
app.post('/api/system-notifications', async (req, res) => {
  try {
    const { notification_type, title, message, priority, metadata } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'title and message are required' });
    }

    const query = `
      INSERT INTO system_notifications (notification_type, title, message, priority, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      notification_type || 'info',
      title,
      message,
      priority || 'normal',
      metadata ? JSON.stringify(metadata) : null
    ]);

    logRequest('POST', '/api/system-notifications', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/system-notifications', 500);
    handleError(res, error);
  }
});

// Get recent notifications (replaces Slack checking)
app.get('/api/system-notifications', async (req, res) => {
  try {
    const { type, priority, limit } = req.query;

    let query = 'SELECT * FROM system_notifications WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (type) {
      paramCount++;
      query += ` AND notification_type = $${paramCount}`;
      params.push(type);
    }

    if (priority) {
      paramCount++;
      query += ` AND priority = $${paramCount}`;
      params.push(priority);
    }

    query += ' ORDER BY created_at DESC';

    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    } else {
      query += ' LIMIT 100';
    }

    const result = await pool.query(query, params);

    logRequest('GET', '/api/system-notifications', 200);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/system-notifications', 500);
    handleError(res, error);
  }
});

// Mark notification as read
app.patch('/api/system-notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      UPDATE system_notifications
      SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    logRequest('PATCH', `/api/system-notifications/${id}/read`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/system-notifications/${id}/read`, 500);
    handleError(res, error);
  }
});

// ============================================
// SIMPLE ANALYTICS SYSTEM (Replaces External Analytics)
// ============================================

// Track events internally
app.post('/api/analytics/events', async (req, res) => {
  try {
    const { event_name, event_properties, lead_id, company_id } = req.body;

    if (!event_name) {
      return res.status(400).json({ error: 'event_name is required' });
    }

    const query = `
      INSERT INTO analytics_events (event_name, event_properties, lead_id, company_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      event_name,
      event_properties ? JSON.stringify(event_properties) : null,
      lead_id || null,
      company_id || null
    ]);

    logRequest('POST', '/api/analytics/events', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/analytics/events', 500);
    handleError(res, error);
  }
});

// Get analytics summary
app.get('/api/analytics/summary', async (req, res) => {
  try {
    const { start_date, end_date, company_id } = req.query;

    let query = `
      SELECT 
        event_name,
        COUNT(*) as event_count,
        COUNT(DISTINCT lead_id) as unique_leads,
        DATE(created_at) as event_date
      FROM analytics_events
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;

    if (start_date) {
      paramCount++;
      query += ` AND created_at >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND created_at <= $${paramCount}`;
      params.push(end_date);
    }

    if (company_id) {
      paramCount++;
      query += ` AND company_id = $${paramCount}`;
      params.push(company_id);
    }

    query += ' GROUP BY event_name, DATE(created_at) ORDER BY event_date DESC;';

    const result = await pool.query(query, params);

    logRequest('GET', '/api/analytics/summary', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/analytics/summary', 500);
    handleError(res, error);
  }
});

// ============================================
// SIMPLE ALERT/NOTIFICATION ENDPOINT
// ============================================

// Send alert (replaces Slack webhook in n8n)
app.post('/api/alerts', async (req, res) => {
  try {
    const { alert_type, title, message, severity, lead_id, metadata } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'title and message are required' });
    }

    const query = `
      INSERT INTO alerts (alert_type, title, message, severity, lead_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      alert_type || 'info',
      title,
      message,
      severity || 'normal',
      lead_id || null,
      metadata ? JSON.stringify(metadata) : null
    ]);

    // Also create a system notification for UI
    await pool.query(`
      INSERT INTO system_notifications (notification_type, title, message, priority, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `, [alert_type, title, message, severity, metadata ? JSON.stringify(metadata) : null]);

    logRequest('POST', '/api/alerts', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/alerts', 500);
    handleError(res, error);
  }
});

// Get recent alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const { severity, alert_type, limit } = req.query;

    let query = 'SELECT * FROM alerts WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (severity) {
      paramCount++;
      query += ` AND severity = $${paramCount}`;
      params.push(severity);
    }

    if (alert_type) {
      paramCount++;
      query += ` AND alert_type = $${paramCount}`;
      params.push(alert_type);
    }

    query += ' ORDER BY created_at DESC';

    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    } else {
      query += ' LIMIT 50';
    }

    const result = await pool.query(query, params);

    logRequest('GET', '/api/alerts', 200);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/alerts', 500);
    handleError(res, error);
  }
});



// ============================================
// CALL RECORDINGS ENDPOINT
// ============================================

// Get recording by call_sid
app.get('/api/recordings/:call_sid', async (req, res) => {
  try {
    const { call_sid } = req.params;

    const query = `
      SELECT recording_url, local_audio_path, call_duration, created_at
      FROM call_logs
      WHERE call_sid = $1;
    `;

    const result = await pool.query(query, [call_sid]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recording not found' });
    }

    logRequest('GET', `/api/recordings/${call_sid}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/recordings/${call_sid}`, 500);
    handleError(res, error);
  }
});

// ============================================
// SUMMARY REPORTS ENDPOINT (Replaces metrics reports)
// ============================================

app.get('/api/reports/daily-summary', async (req, res) => {
  try {
    const { date, company_id } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const summary = {};

    // Calls summary
    let callsQuery = `
      SELECT 
        call_type,
        call_status,
        COUNT(*) as count,
        AVG(call_duration) as avg_duration
      FROM call_logs
      WHERE DATE(created_at) = $1
    `;
    const params = [targetDate];
    let paramCount = 1;

    if (company_id) {
      paramCount++;
      callsQuery += ` AND company_id = $${paramCount}`;
      params.push(company_id);
    }

    callsQuery += ' GROUP BY call_type, call_status;';
    
    const callsResult = await pool.query(callsQuery, params);
    summary.calls = callsResult.rows;

    // Sentiment summary
    const sentimentQuery = `
      SELECT 
        sentiment->>'sentiment' as sentiment_type,
        COUNT(*) as count
      FROM call_logs
      WHERE DATE(created_at) = $1
      AND sentiment IS NOT NULL
      ${company_id ? `AND company_id = $2` : ''}
      GROUP BY sentiment->>'sentiment';
    `;
    
    const sentimentResult = await pool.query(sentimentQuery, company_id ? [targetDate, company_id] : [targetDate]);
    summary.sentiment = sentimentResult.rows;

    // Leads updated
    const leadsQuery = `
      SELECT 
        lead_status,
        COUNT(*) as count
      FROM leads
      WHERE DATE(updated_at) = $1
      ${company_id ? `AND company_id = $2` : ''}
      GROUP BY lead_status;
    `;
    
    const leadsResult = await pool.query(leadsQuery, company_id ? [targetDate, company_id] : [targetDate]);
    summary.leads = leadsResult.rows;

    logRequest('GET', '/api/reports/daily-summary', 200);
    res.json({ 
      success: true, 
      date: targetDate,
      data: summary 
    });
  } catch (error) {
    logRequest('GET', '/api/reports/daily-summary', 500);
    handleError(res, error);
  }
});

// ============================================
// SIMPLE EMAIL NOTIFICATION (No external SMTP)
// ============================================

// Store email notifications in database (to be sent by a cron job)
app.post('/api/email-queue', async (req, res) => {
  try {
    const { to_email, subject, body, lead_id, priority } = req.body;

    if (!to_email || !subject || !body) {
      return res.status(400).json({ error: 'to_email, subject, and body are required' });
    }

    const query = `
      INSERT INTO email_queue (to_email, subject, body, lead_id, priority, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING *;
    `;

    const result = await pool.query(query, [
      to_email,
      subject,
      body,
      lead_id || null,
      priority || 'normal'
    ]);

    logRequest('POST', '/api/email-queue', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/email-queue', 500);
    handleError(res, error);
  }
});

// Get pending emails
app.get('/api/email-queue/pending', async (req, res) => {
  try {
    const query = `
      SELECT * FROM email_queue
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT 50;
    `;

    const result = await pool.query(query);

    logRequest('GET', '/api/email-queue/pending', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/email-queue/pending', 500);
    handleError(res, error);
  }
});

// ============================================
// HOT LEADS ENDPOINT (Simple replacement for Slack alerts)
// ============================================

app.get('/api/hot-leads', async (req, res) => {
  try {
    const query = `
      SELECT 
        l.*,
        cl.sentiment->>'tone_score' as tone_score,
        cl.summary->>'intent' as intent,
        cl.created_at as last_call_date
      FROM leads l
      JOIN call_logs cl ON l.id = cl.lead_id
      WHERE l.lead_status = 'qualified'
      OR (cl.sentiment->>'tone_score')::int >= 7
      OR cl.summary->>'intent' = 'interested'
      ORDER BY cl.created_at DESC
      LIMIT 50;
    `;

    const result = await pool.query(query);

    logRequest('GET', '/api/hot-leads', 200);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/hot-leads', 500);
    handleError(res, error);
  }
});

// ============================================
// FAILED CALLS ENDPOINT
// ============================================

app.get('/api/failed-calls', async (req, res) => {
  try {
    const { limit } = req.query;

    const query = `
      SELECT 
        cl.*,
        l.name,
        l.email,
        l.phone_number
      FROM call_logs cl
      LEFT JOIN leads l ON cl.lead_id = l.id
      WHERE cl.call_status = 'failed'
      ORDER BY cl.created_at DESC
      LIMIT $1;
    `;

    const result = await pool.query(query, [parseInt(limit) || 50]);

    logRequest('GET', '/api/failed-calls', 200);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/failed-calls', 500);
    handleError(res, error);
  }
});

// ============================================
// SIMPLE DASHBOARD DATA ENDPOINT
// ============================================

app.get('/api/dashboard/overview', async (req, res) => {
  try {
    const overview = {};

    // Today's stats
    const today = new Date().toISOString().split('T')[0];

    // Calls today
    const callsToday = await pool.query(`
      SELECT COUNT(*) as total, call_status
      FROM call_logs
      WHERE DATE(created_at) = $1
      GROUP BY call_status;
    `, [today]);
    overview.calls_today = callsToday.rows;

    // Hot leads (high interest)
    const hotLeads = await pool.query(`
      SELECT COUNT(*) as count
      FROM leads
      WHERE lead_status = 'qualified'
      AND updated_at >= NOW() - INTERVAL '24 hours';
    `);
    overview.hot_leads_24h = parseInt(hotLeads.rows[0].count);

    // Failed calls today
    const failedCalls = await pool.query(`
      SELECT COUNT(*) as count
      FROM call_logs
      WHERE call_status = 'failed'
      AND DATE(created_at) = $1;
    `, [today]);
    overview.failed_calls_today = parseInt(failedCalls.rows[0].count);

    // Active calls right now
    const activeCalls = await pool.query(`
      SELECT COUNT(*) as count
      FROM call_logs
      WHERE call_status IN ('initiated', 'in-progress', 'ringing')
      AND created_at >= NOW() - INTERVAL '1 hour';
    `);
    overview.active_calls = parseInt(activeCalls.rows[0].count);

    // Pending scheduled calls
    const pendingCalls = await pool.query(`
      SELECT COUNT(*) as count
      FROM scheduled_calls
      WHERE status = 'pending'
      AND scheduled_time <= NOW() + INTERVAL '24 hours';
    `);
    overview.pending_calls_24h = parseInt(pendingCalls.rows[0].count);

    logRequest('GET', '/api/dashboard/overview', 200);
    res.json({ success: true, data: overview });
  } catch (error) {
    logRequest('GET', '/api/dashboard/overview', 500);
    handleError(res, error);
  }
});





// ============================================
// ERROR HANDLING
// ============================================

app.use((req, res) => {
  logRequest(req.method, req.path, 404);
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal Server Error' 
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✓ WhatsApp CRM Backend running on http://localhost:${PORT}`);
  console.log(`✓ Database: ${process.env.DB_NAME}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV}\n`);
});