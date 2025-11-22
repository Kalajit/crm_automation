
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const WebSocket = require('ws');
const http = require('http');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');

const { Translate } = require('@google-cloud/translate').v2;
const invoicePayment = require('./invoicePayment.js');





require('dotenv').config();

const app = express();

// Initialize Google Cloud Translation client
const translate = new Translate({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'google-credentials.json')
});




// Language mappings
const LANGUAGE_MAP = {
  'en': 'English',
  'hi': 'Hindi',
  'kn': 'Kannada',
  'ml': 'Malayalam',
  'ta': 'Tamil',
  'te': 'Telugu'
};

const LANGUAGE_KEYWORDS = {
    'hi': ['hindi', 'hindi mein', 'हिंदी', 'hindi me bolo', 'speak hindi', 'हिन्दी में'],
    'kn': ['kannada', 'kannada mein', 'ಕನ್ನಡ', 'kannada nalli', 'speak kannada', 'ಕನ್ನಡದಲ್ಲಿ'],
    'ml': ['malayalam', 'malayalam il', 'മലയാളം', 'malayalam parayamo', 'speak malayalam', 'മലയാളത്തിൽ'],
    'ta': ['tamil', 'tamil la', 'தமிழ்', 'tamil paesu', 'speak tamil', 'தமிழில்'],
    'te': ['telugu', 'telugu lo', 'తెలుగు', 'telugu cheppu', 'speak telugu', 'తెలుగులో'],
    'en': ['english', 'english mein', 'speak english', 'english please', 'talk in english']
  };
  

// Create HTTP server for both Express and WebSocket
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Track active WebSocket connections per call_sid
const activeConnections = new Map(); // call_sid -> Set of WebSocket clients



// ============================================
// ✅ UPDATED: Translation Function (LibreTranslate + DeepL Fallback)
// ============================================



/**
 * Translate text using Google Cloud Translation API
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code
 * @param {string} sourceLang - Source language code (optional)
 * @returns {Promise<string>} - Translated text
 */
async function translateText(text, targetLang, sourceLang = null) {
  if (!text || !text.trim()) {
    return text;
  }

  // No translation needed
  if (sourceLang === targetLang) {
    return text;
  }

  try {
    const options = {
      to: targetLang
    };
    
    if (sourceLang) {
      options.from = sourceLang;
    }

    const [translation] = await translate.translate(text, options);
    console.log(`✅ Translated: ${text.substring(0, 50)}... → ${translation.substring(0, 50)}...`);
    return translation;
  } catch (error) {
    console.error('❌ Translation failed:', error);
    return text; // Return original text on failure
  }
}




/**
 * Detect language using Google Cloud Translation API
 * @param {string} text - Text to detect language for
 * @returns {Promise<string>} - Language code
 */
async function detectLanguage(text) {
  if (!text || text.trim().length < 3) {
    return 'en';
  }

  // Check for explicit language keywords first
  const textLower = text.toLowerCase();
  for (const [langCode, keywords] of Object.entries(LANGUAGE_KEYWORDS)) {
    if (keywords.some(keyword => textLower.includes(keyword))) {
      console.log(`🔍 Detected language via keyword: ${langCode}`);
      return langCode;
    }
  }

  try {
    const [detection] = await translate.detect(text);
    const detectedLang = detection.language;
    const confidence = detection.confidence;

    if (LANGUAGE_MAP[detectedLang]) {
      console.log(`🔍 Detected language: ${detectedLang} (confidence: ${confidence.toFixed(2)})`);
      return detectedLang;
    } else {
      console.log(`⚠️ Unsupported language detected: ${detectedLang}, defaulting to English`);
      return 'en';
    }
  } catch (error) {
    console.error('❌ Language detection failed:', error);
    return 'en';
  }
}


async function translateBatch(texts, targetLang, sourceLang = 'en') {
  if (targetLang === sourceLang || !texts || texts.length === 0) {
    return texts;
  }
  
  try {
    console.log(`🌐 Batch translating ${texts.length} texts: ${sourceLang} → ${targetLang}`);
    
    // Join texts with delimiter for batch processing
    const combinedText = texts.join(' ||| ');
    const translated = await translateText(combinedText, targetLang, sourceLang);
    
    // Split back
    const translatedTexts = translated.split(' ||| ');
    
    // Validate lengths match
    if (translatedTexts.length === texts.length) {
      console.log(`✅ Batch translation complete: ${texts.length} texts`);
      return translatedTexts;
    } else {
      console.warn(`⚠️ Batch translation length mismatch, falling back to individual`);
      // Fallback to individual translations
      return await Promise.all(
        texts.map(text => translateText(text, targetLang, sourceLang))
      );
    }
    
  } catch (error) {
    console.error(`❌ Batch translation error: ${error.message}`);
    // Fallback to individual translations
    return await Promise.all(
      texts.map(text => translateText(text, targetLang, sourceLang))
    );
  }
}

// // ============================================
// // ✅ EXPORT FUNCTIONS
// // ============================================

module.exports = {
  detectLanguage,
  translateText,
  handleMultilingualWhatsAppMessage,
  sendWhatsAppResponse,
  generateWhatsAppConfirmation,
  generateAlternativeSlotsMessage,
  LANGUAGE_MAP
};


// IndicTrans2 Configuration (AI4Bharat - Best for Indian Languages)
const INDICTRANS_URL = process.env.INDICTRANS_URL || 'http://indictrans:5000';

// Optional: DeepL Configuration
const DEEPL_API_KEY = process.env.DEEPL_API_KEY || null;


const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;


// ============================================
// PHONEPE CONFIGURATION
// ============================================

const PHONEPE_CONFIG = {
  merchantId: process.env.PHONEPE_MERCHANT_ID || 'PGTESTPAYUAT',
  saltKey: process.env.PHONEPE_SALT_KEY || '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399',
  saltIndex: parseInt(process.env.PHONEPE_SALT_INDEX || '1'),
  baseUrl: process.env.PHONEPE_BASE_URL || 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  redirectUrl: process.env.PHONEPE_REDIRECT_URL || 'http://localhost:3000/payment-result',
  callbackUrl: process.env.PHONEPE_CALLBACK_URL || 'http://localhost:3000/api/payment-callback'
};


// ============================================
// MIDDLEWARE
// ============================================

app.use(helmet());
// app.use(cors({
//   origin: process.env.CORS_ORIGIN?.split(',') || '*'
// }));
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:8501', 'https://*.ngrok-free.app'],  // ✅ Allow Streamlit + ngrok
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);


app.use(session({
  secret: process.env.SESSION_SECRET || 'your-super-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    maxAge: 3600000 // 1 hour
  }
}));

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

process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM received, closing database pool...');
  await pool.end();
  process.exit(0);
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
// WEBSOCKET HANDLER FOR LIVE CALL UPDATES
// ============================================

wss.on('connection', (ws, req) => {
  // Extract call_sid from URL: /ws/live-call/:call_sid
  const urlParts = req.url.split('/');
  const call_sid = urlParts[urlParts.length - 1];
  
  if (!call_sid || call_sid.length < 10) {
    ws.send(JSON.stringify({ error: 'Invalid call_sid' }));
    ws.close();
    return;
  }
  
  // Register connection
  if (!activeConnections.has(call_sid)) {
    activeConnections.set(call_sid, new Set());
  }
  activeConnections.get(call_sid).add(ws);
  
  console.log(`[WS] Client connected to call ${call_sid} (${activeConnections.get(call_sid).size} active)`);
  
  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    call_sid: call_sid,
    timestamp: new Date().toISOString()
  }));
  
  // Handle incoming messages from client (e.g., agent notes)
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'agent_note') {
        // Store agent note in database
        await pool.query(`
          UPDATE call_logs
          SET summary = jsonb_set(
            COALESCE(summary, '{}'::jsonb),
            '{agent_notes}',
            to_jsonb($1::text)
          )
          WHERE call_sid = $2
        `, [data.note, call_sid]);
        
        // Broadcast to all other clients on this call
        broadcastToCall(call_sid, {
          type: 'agent_note',
          note: data.note,
          timestamp: new Date().toISOString()
        }, ws);
      }
      
    } catch (error) {
      console.error('[WS] Error handling message:', error);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    if (activeConnections.has(call_sid)) {
      activeConnections.get(call_sid).delete(ws);
      
      if (activeConnections.get(call_sid).size === 0) {
        activeConnections.delete(call_sid);
        console.log(`[WS] All clients disconnected from call ${call_sid}, cleanup complete`);
      } else {
        console.log(`[WS] Client disconnected from call ${call_sid} (${activeConnections.get(call_sid).size} remaining)`);
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error(`[WS] Error on call ${call_sid}:`, error);
    ws.close();
  });
});

// Helper function to broadcast to all clients watching a call
function broadcastToCall(call_sid, data, excludeWs = null) {
  if (!activeConnections.has(call_sid)) return;
  
  const message = JSON.stringify(data);
  let sentCount = 0;
  
  activeConnections.get(call_sid).forEach((client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(message);
      sentCount++;
    }
  });
  
  console.log(`[WS] Broadcast to ${sentCount} clients on call ${call_sid}`);
}



// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: './recordings/',
  filename: (req, file, cb) => {
    const callSid = req.body.call_sid || 'unknown';
    cb(null, `${callSid}_${Date.now()}.mp3`);
  }
});

const upload = multer({ storage });

app.post('/api/recordings/upload', upload.single('audio_file'), async (req, res) => {
  try {
    const { call_sid, filename  } = req.body;
    const uploadedFilePath = req.file.path;


    let finalPath = uploadedFilePath;
    if (filename) {
      const uploadDir = path.dirname(uploadedFilePath);
      finalPath = path.join(uploadDir, filename);

      // Check if source file exists before renaming
      if (fs.existsSync(uploadedFilePath)) {
        fs.renameSync(uploadedFilePath, finalPath);
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'Uploaded file not found' 
        });
      }
    }
    
    // Update call log with local path
    await pool.query(`
      UPDATE call_logs
      SET local_audio_path = $1, updated_at = NOW()
      WHERE call_sid = $2
    `, [finalPath, call_sid]);
    
    res.json({
      success: true,
      saved_as: filename || path.basename(finalPath),
      local_path: finalPath,
      message: 'Recording saved locally'
    });
    
  } catch (error) {
    console.error('Recording upload error:', error);
    res.status(500).json({ error: error.message });
  }
});




// ============================================
// REST API ENDPOINT FOR PYTHON TO PUSH UPDATES
// ============================================

app.post('/api/live-update', async (req, res) => {
  try {
    const {
      call_sid,
      lead_id,
      sentiment,
      summary,
      transcript,
      turn_count,
      call_status,
      call_duration,
      recording_url,
      timestamp
    } = req.body;
    
    if (!call_sid) {
      return res.status(400).json({ error: 'call_sid is required' });
    }
    
    // Fetch lead info to enrich payload
    let leadInfo = null;
    if (lead_id) {
      const leadResult = await pool.query('SELECT name, phone_number, email, chess_rating FROM leads WHERE id = $1', [lead_id]);
      leadInfo = leadResult.rows[0] || null;
    }
    
    // Broadcast to all WebSocket clients watching this call
    const payload = {
      type: 'live_update',
      call_sid,
      lead_id,
      lead_info: leadInfo,
      sentiment,
      summary,
      transcript,
      turn_count,
      call_status,
      call_duration,
      recording_url,
      timestamp: timestamp || new Date().toISOString()
    };
    
    broadcastToCall(call_sid, payload);
    
    logRequest('POST', '/api/live-update', 200);
    res.json({ 
      success: true, 
      message: `Broadcast to ${activeConnections.get(call_sid)?.size || 0} clients`,
      call_sid 
    });
    
  } catch (error) {
    console.error('[WS] Live update error:', error);
    logRequest('POST', '/api/live-update', 500);
    handleError(res, error);
  }
});

// ============================================
// ENDPOINT TO GET ACTIVE WS CONNECTIONS (DEBUG)
// ============================================

app.get('/api/ws/stats', (req, res) => {
  const stats = {};
  activeConnections.forEach((clients, call_sid) => {
    stats[call_sid] = clients.size;
  });
  
  res.json({
    success: true,
    total_calls: activeConnections.size,
    total_clients: Array.from(activeConnections.values()).reduce((sum, set) => sum + set.size, 0),
    calls: stats
  });
});


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



// GET SINGLE LEAD BY ID
app.get('/api/leads/:lead_id(\\d+)', async (req, res) => {
  
  const { lead_id } = req.params;
  try {
    
    const query = `
      SELECT l.*, c.name as company_name
      FROM leads l
      LEFT JOIN companies c ON l.company_id = c.id
      WHERE l.id = $1
    `;
    
    const result = await pool.query(query, [lead_id]);
    
    if (result.rows.length === 0) {
      logRequest('GET', `/api/leads/${lead_id}`, 404);
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    
    logRequest('GET', `/api/leads/${lead_id}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/leads/${lead_id}`, 500); 
    handleError(res, error);
  }
});



// GET LEAD BY ID (must come before /api/leads/:phone)
app.get('/api/leads/id/:lead_id', async (req, res) => {
  try {
    const { lead_id } = req.params;
    
    const query = `
      SELECT l.*, c.name as company_name
      FROM leads l
      LEFT JOIN companies c ON l.company_id = c.id
      WHERE l.id = $1
    `;
    
    const result = await pool.query(query, [lead_id]);
    
    if (result.rows.length === 0) {
      logRequest('GET', `/api/leads/id/${lead_id}`, 404);
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    
    logRequest('GET', `/api/leads/id/${lead_id}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/leads/id/${lead_id}`, 500);
    handleError(res, error);
  }
});



// Get lead by phone number
app.get('/api/leads/by-phone/:phone', async (req, res) => {
  let  { phone } = req.params;

  try {
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone parameter is required' });
    }

  // Normalize phone — always ensure it starts with '+'
    if (!phone.startsWith('+')) {
      phone = `+${phone}`;
    }

    // Query DB
    const query = `SELECT * FROM leads WHERE phone_number = $1;`;
    const result = await pool.query(query, [phone]);

    // Always return 200 OK
    if (result.rows.length === 0) {
      logRequest('GET', `/api/leads/by-phone/${phone}`, 200);
      return res.json({ success: false, data: null, message: 'Lead not found' });
    }

    // Lead found
    logRequest('GET', `/api/leads/by-phone/${phone}`, 200);
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/leads/by-phone/${phone}`, 500);
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
    let { phone } = req.params;
    // 🔧 FIX: Normalize phone number
    if (!phone.startsWith('+')) {
      phone = '+' + phone;
    }

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

// Create new booking
app.post('/api/bookings', async (req, res) => {
  try {
    const {
      lead_id,
      phone_number,
      booking_type,
      scheduled_date,
      duration_minutes = 60,
      status = 'pending',
      notes,
      calendar_event_id
    } = req.body;
    
    if (!lead_id || !phone_number || !booking_type || !scheduled_date) {
      return res.status(400).json({
        error: 'lead_id, phone_number, booking_type, scheduled_date required'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO bookings (
        lead_id, phone_number, booking_type, scheduled_date,
        duration_minutes, status, notes, calendar_event_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      lead_id,
      phone_number,
      booking_type,
      scheduled_date,
      duration_minutes,
      status,
      notes || null,
      calendar_event_id || null
    ]);
    
    logRequest('POST', '/api/bookings', 201);
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Create booking error:', error);
    logRequest('POST', '/api/bookings', 500);
    res.status(500).json({ error: error.message });
  }
});



// Get all bookings (with optional filters)
app.get('/api/bookings', async (req, res) => {
  try {
    const { lead_id, company_id, status, booking_type, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        b.*,
        l.name as lead_name,
        l.phone_number,
        l.email,
        c.name as company_name
      FROM bookings b
      LEFT JOIN leads l ON b.lead_id = l.id
      LEFT JOIN companies c ON l.company_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (lead_id) {
      query += ` AND b.lead_id = $${paramIndex}`;
      params.push(lead_id);
      paramIndex++;
    }
    
    if (company_id) {
      query += ` AND l.company_id = $${paramIndex}`;
      params.push(company_id);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND b.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (booking_type) {
      query += ` AND b.booking_type = $${paramIndex}`;
      params.push(booking_type);
      paramIndex++;
    }
    
    query += ` ORDER BY b.scheduled_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    logRequest('GET', '/api/bookings', 200);
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('Get bookings error:', error);
    logRequest('GET', '/api/bookings', 500);
    res.status(500).json({ error: error.message });
  }
});



// Get single booking by ID
app.get('/api/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        b.*,
        l.name as lead_name,
        l.phone_number,
        l.email,
        c.name as company_name,
        ce.meeting_link,
        ce.event_id as calendar_event_id
      FROM bookings b
      LEFT JOIN leads l ON b.lead_id = l.id
      LEFT JOIN companies c ON l.company_id = c.id
      LEFT JOIN calendar_events ce ON b.calendar_event_id = ce.event_id
      WHERE b.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    logRequest('GET', `/api/bookings/${id}`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Get booking error:', error);
    logRequest('GET', `/api/bookings/${id}`, 500);
    res.status(500).json({ error: error.message });
  }
});




// Update booking
app.patch('/api/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      scheduled_date,
      duration_minutes,
      status,
      notes,
      calendar_event_id
    } = req.body;
    
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (scheduled_date !== undefined) {
      updates.push(`scheduled_date = $${paramIndex}`);
      values.push(scheduled_date);
      paramIndex++;
    }
    
    if (duration_minutes !== undefined) {
      updates.push(`duration_minutes = $${paramIndex}`);
      values.push(duration_minutes);
      paramIndex++;
    }
    
    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }
    
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      values.push(notes);
      paramIndex++;
    }
    
    if (calendar_event_id !== undefined) {
      updates.push(`calendar_event_id = $${paramIndex}`);
      values.push(calendar_event_id);
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const query = `
      UPDATE bookings 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    logRequest('PATCH', `/api/bookings/${id}`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Update booking error:', error);
    logRequest('PATCH', `/api/bookings/${id}`, 500);
    res.status(500).json({ error: error.message });
  }
});




// Cancel booking
app.delete('/api/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      UPDATE bookings 
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    logRequest('DELETE', `/api/bookings/${id}`, 200);
    res.json({
      success: true,
      message: 'Booking cancelled',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Cancel booking error:', error);
    logRequest('DELETE', `/api/bookings/${id}`, 500);
    res.status(500).json({ error: error.message });
  }
});




// Get upcoming bookings (next 7 days)
app.get('/api/bookings/upcoming', async (req, res) => {
  try {
    const { company_id, days = 7 } = req.query;
    
    let query = `
      SELECT 
        b.*,
        l.name as lead_name,
        l.phone_number,
        l.email,
        ce.meeting_link
      FROM bookings b
      LEFT JOIN leads l ON b.lead_id = l.id
      LEFT JOIN calendar_events ce ON b.calendar_event_id = ce.event_id
      WHERE b.status IN ('pending', 'confirmed')
        AND b.scheduled_date BETWEEN NOW() AND NOW() + INTERVAL '${days} days'
    `;
    
    const params = [];
    
    if (company_id) {
      query += ` AND l.company_id = $1`;
      params.push(company_id);
    }
    
    query += ` ORDER BY b.scheduled_date ASC`;
    
    const result = await pool.query(query, params);
    
    logRequest('GET', '/api/bookings/upcoming', 200);
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('Get upcoming bookings error:', error);
    logRequest('GET', '/api/bookings/upcoming', 500);
    res.status(500).json({ error: error.message });
  }
});




// Get bookings by lead
app.get('/api/bookings/lead/:lead_id', async (req, res) => {
  try {
    const { lead_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        b.*,
        ce.meeting_link,
        ce.event_id as calendar_event_id
      FROM bookings b
      LEFT JOIN calendar_events ce ON b.calendar_event_id = ce.event_id
      WHERE b.lead_id = $1
      ORDER BY b.scheduled_date DESC
    `, [lead_id]);
    
    logRequest('GET', `/api/bookings/lead/${lead_id}`, 200);
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('Get lead bookings error:', error);
    logRequest('GET', `/api/bookings/lead/${lead_id}`, 500);
    res.status(500).json({ error: error.message });
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

    // **NEW: Auto-send summaries to customer**
    try {
      await autoSendCallSummaries(call_sid);
      console.log(`✅ Auto-sent call summaries for ${call_sid}`);
    } catch (summaryError) {
      console.error('Failed to send summaries:', summaryError);
      // Don't fail the webhook if summary delivery fails
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
// app.get('/api/search/leads', async (req, res) => {
//   try {
//     const { query: searchQuery, status, source } = req.query;

//     let query = `SELECT * FROM leads WHERE 1=1`;
//     const params = [];

//     if (searchQuery) {
//       query += ` AND (name ILIKE ${params.length + 1} OR phone_number ILIKE ${params.length + 1})`;
//       params.push(`%${searchQuery}%`);
//     }

//     if (status) {
//       query += ` AND lead_status = ${params.length + 1}`;
//       params.push(status);
//     }

//     if (source) {
//       query += ` AND lead_source = ${params.length + 1}`;
//       params.push(source);
//     }

//     query += ` ORDER BY updated_at DESC LIMIT 50;`;

//     const result = await pool.query(query, params);

//     logRequest('GET', '/api/search/leads', 200);
//     res.json({ success: true, data: result.rows });
//   } catch (error) {
//     logRequest('GET', '/api/search/leads', 500);
//     handleError(res, error);
//   }
// });













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
        if (val === null || val === undefined) return '';
        // Escape double quotes and wrap in quotes if contains comma, newline, or quote
        const stringVal = String(val);
        if (stringVal.includes(',') || stringVal.includes('\n') || stringVal.includes('"')) {
          return `"${stringVal.replace(/"/g, '""')}"`;
        }
        return stringVal;
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
// HUMAN TAKEOVER ENDPOINTS
// ============================================

// 1. CREATE TAKEOVER REQUEST
app.post('/api/takeover/request', async (req, res) => {
  try {
    const {
      lead_id,
      company_id,
      call_sid,
      conversation_id,
      request_type,
      trigger_reason,
      ai_sentiment,
      ai_summary,
      conversation_context,
      priority
    } = req.body;

    if (!lead_id || !request_type || !trigger_reason) {
      return res.status(400).json({ error: 'lead_id, request_type, and trigger_reason are required' });
    }

    // Find best available agent
    const agent = await pool.query(`
      SELECT id, name, email, phone
      FROM human_agents
      WHERE status = 'available'
      AND assigned_leads < max_concurrent_leads
      AND (expertise @> ARRAY[$1] OR role = 'senior_rep')
      ORDER BY assigned_leads ASC, RANDOM()
      LIMIT 1
    `, [trigger_reason]);

    const assigned_agent_id = agent.rows.length > 0 ? agent.rows[0].id : null;

    // Create takeover request
    const query = `
      INSERT INTO takeover_requests (
        lead_id, company_id, call_sid, conversation_id,
        request_type, trigger_reason, ai_sentiment, ai_summary,
        conversation_context, priority, assigned_agent_id,
        status, assigned_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      lead_id,
      company_id || null,
      call_sid || null,
      conversation_id || null,
      request_type,
      trigger_reason,
      ai_sentiment ? JSON.stringify(ai_sentiment) : null,
      ai_summary || null,
      conversation_context || null,
      priority || 'medium',
      assigned_agent_id,
      assigned_agent_id ? 'assigned' : 'pending',
      assigned_agent_id ? new Date().toISOString() : null
    ]);

    // Update agent's assigned count
    if (assigned_agent_id) {
      await pool.query(`
        UPDATE human_agents
        SET assigned_leads = assigned_leads + 1,
            status = CASE WHEN assigned_leads + 1 >= max_concurrent_leads THEN 'busy' ELSE 'available' END
        WHERE id = $1
      `, [assigned_agent_id]);

      // Send notification to agent
      const agentData = agent.rows[0];
      await pool.query(`
        INSERT INTO notifications (
          lead_id, phone_number, notification_type, title, message,
          scheduled_time, delivery_channel
        )
        VALUES ($1, $2, 'takeover_alert', $3, $4, CURRENT_TIMESTAMP, 'whatsapp')
      `, [
        lead_id,
        agentData.phone,
        '🔥 New Lead Takeover',
        `Urgent: ${trigger_reason} lead assigned to you. Lead ID: ${lead_id}. Check dashboard now!`
      ]);
    }

    logRequest('POST', '/api/takeover/request', 201);
    res.status(201).json({ success: true, data: result.rows[0], agent: agent.rows[0] || null });
  } catch (error) {
    logRequest('POST', '/api/takeover/request', 500);
    handleError(res, error);
  }
});

// 2. GET PENDING TAKEOVERS FOR AGENT
app.get('/api/takeover/my-requests/:agent_id', async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status } = req.query;

    let query = `
      SELECT 
        tr.*,
        l.name as lead_name,
        l.phone_number,
        l.email,
        l.chess_rating,
        l.location,
        c.conversation_history,
        ha.name as agent_name
      FROM takeover_requests tr
      JOIN leads l ON tr.lead_id = l.id
      LEFT JOIN conversations c ON tr.conversation_id = c.id
      LEFT JOIN human_agents ha ON tr.assigned_agent_id = ha.id
      WHERE tr.assigned_agent_id = $1
    `;

    const params = [agent_id];

    if (status) {
      params.push(status);
      query += ` AND tr.status = $${params.length}`;
    } else {
      query += ` AND tr.status IN ('pending', 'assigned', 'in_progress')`;
    }

    query += ' ORDER BY tr.priority DESC, tr.created_at ASC;';

    const result = await pool.query(query, params);

    logRequest('GET', `/api/takeover/my-requests/${agent_id}`, 200);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/takeover/my-requests/${agent_id}`, 500);
    handleError(res, error);
  }
});

// 3. ACCEPT TAKEOVER
app.patch('/api/takeover/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    const { agent_id } = req.body;

    // Start human session
    const takeover = await pool.query('SELECT * FROM takeover_requests WHERE id = $1', [id]);

    if (takeover.rows.length === 0) {
      return res.status(404).json({ error: 'Takeover request not found' });
    }

    const tr = takeover.rows[0];

    // Update takeover status
    await pool.query(`
      UPDATE takeover_requests
      SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    // Create human session
    await pool.query(`
      INSERT INTO human_sessions (agent_id, lead_id, session_type, started_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `, [agent_id, tr.lead_id, tr.request_type === 'call_transfer' ? 'call' : 'whatsapp']);

    // Pause AI agent
    await pool.query(`
      UPDATE conversations
      SET ai_summary = COALESCE(ai_summary || E'\n', '') || '[HUMAN_TAKEOVER] Human agent ${agent_id} took over at ${new Date().toISOString()}'
      WHERE id = $1
    `, [tr.conversation_id]);

    logRequest('PATCH', `/api/takeover/${id}/accept`, 200);
    res.json({ success: true, message: 'Takeover accepted, AI paused' });
  } catch (error) {
    logRequest('PATCH', `/api/takeover/${id}/accept`, 500);
    handleError(res, error);
  }
});

// 4. COMPLETE TAKEOVER
app.patch('/api/takeover/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { outcome, notes, resume_ai } = req.body;

    const takeover = await pool.query('SELECT * FROM takeover_requests WHERE id = $1', [id]);

    if (takeover.rows.length === 0) {
      return res.status(404).json({ error: 'Takeover request not found' });
    }

    const tr = takeover.rows[0];

    // Update takeover
    await pool.query(`
      UPDATE takeover_requests
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    // End human session
    await pool.query(`
      UPDATE human_sessions
      SET ended_at = CURRENT_TIMESTAMP,
          duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)),
          outcome = $1,
          notes = $2
      WHERE agent_id = $3 AND lead_id = $4 AND ended_at IS NULL
    `, [outcome, notes, tr.assigned_agent_id, tr.lead_id]);

    // Decrement agent's assigned count
    await pool.query(`
      UPDATE human_agents
      SET assigned_leads = GREATEST(assigned_leads - 1, 0),
          status = 'available'
      WHERE id = $1
    `, [tr.assigned_agent_id]);

    // Resume AI if requested
    if (resume_ai && tr.conversation_id) {
      await pool.query(`
        UPDATE conversations
        SET ai_summary = COALESCE(ai_summary || E'\n', '') || '[AI_RESUMED] AI agent resumed at ${new Date().toISOString()}'
        WHERE id = $1
      `, [tr.conversation_id]);
    }

    logRequest('PATCH', `/api/takeover/${id}/complete`, 200);
    res.json({ success: true, message: 'Takeover completed' });
  } catch (error) {
    logRequest('PATCH', `/api/takeover/${id}/complete`, 500);
    handleError(res, error);
  }
});

// 5. GET ALL AGENTS
app.get('/api/human-agents', async (req, res) => {
  try {
    const { status, role } = req.query;

    let query = 'SELECT * FROM human_agents WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    if (role) {
      params.push(role);
      query += ` AND role = $${params.length}`;
    }

    query += ' ORDER BY assigned_leads ASC;';

    const result = await pool.query(query, params);

    logRequest('GET', '/api/human-agents', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/human-agents', 500);
    handleError(res, error);
  }
});

// 6. UPDATE AGENT STATUS
app.patch('/api/human-agents/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['available', 'busy', 'offline'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await pool.query(`
      UPDATE human_agents
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [status, id]);

    logRequest('PATCH', `/api/human-agents/${id}/status`, 200);
    res.json({ success: true, message: 'Status updated' });
  } catch (error) {
    logRequest('PATCH', `/api/human-agents/${id}/status`, 500);
    handleError(res, error);
  }
});




// ============================================
// CAMPAIGN MANAGEMENT
// ============================================

// Create campaign
app.post('/api/campaigns', async (req, res) => {
  try {
    const { company_id, campaign_name, campaign_type, target_leads, scheduled_start, call_rate_per_minute } = req.body;

    if (!company_id || !campaign_name || !target_leads) {
      return res.status(400).json({ error: 'company_id, campaign_name, and target_leads are required' });
    }

    const query = `
      INSERT INTO campaigns (
        company_id, campaign_name, campaign_type, 
        total_leads, scheduled_start, call_rate_per_minute, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
      RETURNING *;
    `;

    const result = await pool.query(query, [
      company_id,
      campaign_name,
      campaign_type || 'outbound',
      target_leads.length,
      scheduled_start || new Date().toISOString(),
      call_rate_per_minute || 1
    ]);

    const campaign_id = result.rows[0].id;

    // Bulk insert scheduled calls
    const values = target_leads.map((lead, idx) => 
      `(${company_id}, ${lead.lead_id}, '${campaign_type}', '${scheduled_start}', ${campaign_id})`
    ).join(',');

    await pool.query(`
      INSERT INTO scheduled_calls (company_id, lead_id, call_type, scheduled_time, campaign_id)
      VALUES ${values}
    `);

    logRequest('POST', '/api/campaigns', 201);
    res.status(201).json({ 
      success: true, 
      campaign_id: campaign_id,
      scheduled_calls: target_leads.length,
      message: `Campaign created with ${target_leads.length} calls scheduled`
    });
  } catch (error) {
    logRequest('POST', '/api/campaigns', 500);
    handleError(res, error);
  }
});

// Get campaign stats
app.get('/api/campaigns/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await pool.query(`
      SELECT 
        c.campaign_name,
        c.total_leads,
        c.status as campaign_status,
        COUNT(sc.id) FILTER (WHERE sc.status = 'pending') as pending,
        COUNT(sc.id) FILTER (WHERE sc.status = 'called') as called,
        COUNT(cl.id) FILTER (WHERE cl.call_status = 'completed') as completed,
        COUNT(cl.id) FILTER (WHERE cl.call_status = 'failed') as failed,
        AVG(cl.call_duration) as avg_duration
      FROM campaigns c
      LEFT JOIN scheduled_calls sc ON c.id = sc.campaign_id
      LEFT JOIN call_logs cl ON sc.call_sid = cl.call_sid
      WHERE c.id = $1
      GROUP BY c.id
    `, [id]);

    if (stats.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    logRequest('GET', `/api/campaigns/${id}/stats`, 200);
    res.json({ success: true, data: stats.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/campaigns/${id}/stats`, 500);
    handleError(res, error);
  }
});





// ============================================
// ADS INTEGRATION
// ============================================

// Website form capture with UTM
app.post('/api/leads/website', async (req, res) => {
  try {
    const { 
      name, 
      phone, 
      email, 
      message,
      utm_source,
      utm_campaign,
      utm_medium,
      utm_content,
      utm_term
    } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Normalize phone
    let normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone.length === 10) {
      normalizedPhone = `+91${normalizedPhone}`;
    } else if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = `+${normalizedPhone}`;
    }

    // Create metadata with UTM params
    const metadata = {};
    if (utm_source) metadata.utm_source = utm_source;
    if (utm_campaign) metadata.utm_campaign = utm_campaign;
    if (utm_medium) metadata.utm_medium = utm_medium;
    if (utm_content) metadata.utm_content = utm_content;
    if (utm_term) metadata.utm_term = utm_term;

    // Create tags
    const tags = ['website'];
    if (utm_source) tags.push(`source_${utm_source}`);
    if (utm_campaign) tags.push(`campaign_${utm_campaign}`);

    const query = `
      INSERT INTO leads (
        phone_number, name, email, lead_source, metadata, tags, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (phone_number) DO UPDATE
      SET 
        name = COALESCE(EXCLUDED.name, leads.name),
        email = COALESCE(EXCLUDED.email, leads.email),
        metadata = leads.metadata || EXCLUDED.metadata,
        tags = array_cat(leads.tags, EXCLUDED.tags),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const result = await pool.query(query, [
      normalizedPhone,
      name,
      email,
      utm_source || 'website',
      JSON.stringify(metadata),
      tags,
      message
    ]);

    // Send auto-response
    const autoResponse = `Hi ${name || 'there'}! Thanks for your interest in 4champz. We'll contact you within 24 hours. In the meantime, check out our programs at https://4champz.com`;
    
    // Queue WhatsApp message
    await pool.query(`
      INSERT INTO notifications (
        lead_id, phone_number, notification_type, title, message,
        scheduled_time, delivery_channel
      )
      VALUES ($1, $2, 'welcome', 'Welcome to 4champz', $3, CURRENT_TIMESTAMP, 'whatsapp')
    `, [result.rows[0].id, normalizedPhone, autoResponse]);

    logRequest('POST', '/api/leads/website', 201);
    res.status(201).json({ 
      success: true, 
      data: result.rows[0],
      message: 'Lead captured, auto-response queued'
    });
  } catch (error) {
    logRequest('POST', '/api/leads/website', 500);
    handleError(res, error);
  }
});




// ============================================
// DYNAMIC CUSTOM FIELDS API
// ============================================

// 1. GET EXTRACTION TEMPLATES
app.get('/api/extraction-templates', async (req, res) => {
  try {
    const { industry } = req.query;
    
    let query = 'SELECT * FROM extraction_templates WHERE 1=1';
    const params = [];
    
    if (industry) {
      params.push(industry);
      query += ` AND industry = $${params.length}`;
    }
    
    query += ' ORDER BY template_name;';
    
    const result = await pool.query(query, params);
    
    logRequest('GET', '/api/extraction-templates', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/extraction-templates', 500);
    handleError(res, error);
  }
});

// 2. APPLY TEMPLATE TO COMPANY
app.post('/api/companies/:company_id/apply-template', async (req, res) => {
  try {
    const { company_id } = req.params;
    const { template_id, agent_instance_id } = req.body;
    
    // Get template
    const template = await pool.query(
      'SELECT * FROM extraction_templates WHERE id = $1',
      [template_id]
    );
    
    if (template.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const fieldDefs = template.rows[0].field_definitions.fields;
    
    // Insert field definitions
    const inserted = [];
    for (const field of fieldDefs) {
      const result = await pool.query(`
        INSERT INTO custom_field_definitions (
          company_id, agent_instance_id, field_key, field_label, 
          field_type, field_category, is_required, 
          validation_rules, extraction_config
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (company_id, field_key) DO UPDATE
        SET 
          field_label = EXCLUDED.field_label,
          field_type = EXCLUDED.field_type,
          extraction_config = EXCLUDED.extraction_config,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `, [
        company_id,
        agent_instance_id || null,
        field.field_key,
        field.field_label,
        field.field_type,
        field.field_category,
        field.is_required || false,
        field.validation_rules ? JSON.stringify(field.validation_rules) : null,
        JSON.stringify(field.extraction_config)
      ]);
      
      inserted.push(result.rows[0]);
    }
    
    logRequest('POST', `/api/companies/${company_id}/apply-template`, 201);
    res.status(201).json({ 
      success: true, 
      message: `Applied ${fieldDefs.length} field definitions`,
      data: inserted 
    });
  } catch (error) {
    logRequest('POST', `/api/companies/${company_id}/apply-template`, 500);
    handleError(res, error);
  }
});

// 3. GET CUSTOM FIELDS FOR COMPANY/AGENT
app.get('/api/custom-fields/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    const { agent_instance_id } = req.query;
    
    let query = `
      SELECT * FROM custom_field_definitions 
      WHERE company_id = $1 AND is_active = TRUE
    `;
    const params = [company_id];
    
    if (agent_instance_id) {
      params.push(agent_instance_id);
      query += ` AND (agent_instance_id = $${params.length} OR agent_instance_id IS NULL)`;
    }
    
    query += ' ORDER BY display_order, field_label;';
    
    const result = await pool.query(query, params);
    
    logRequest('GET', `/api/custom-fields/${company_id}`, 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/custom-fields/${company_id}`, 500);
    handleError(res, error);
  }
});

// 4. ADD/UPDATE CUSTOM FIELD DEFINITION
app.post('/api/custom-fields', async (req, res) => {
  try {
    const {
      company_id,
      agent_instance_id,
      field_key,
      field_label,
      field_type,
      field_category,
      is_required,
      validation_rules,
      extraction_config
    } = req.body;
    
    if (!company_id || !field_key || !field_label || !field_type) {
      return res.status(400).json({ 
        error: 'company_id, field_key, field_label, and field_type are required' 
      });
    }
    
    const query = `
      INSERT INTO custom_field_definitions (
        company_id, agent_instance_id, field_key, field_label, 
        field_type, field_category, is_required, 
        validation_rules, extraction_config
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (company_id, field_key) DO UPDATE
      SET 
        field_label = EXCLUDED.field_label,
        field_type = EXCLUDED.field_type,
        field_category = EXCLUDED.field_category,
        is_required = EXCLUDED.is_required,
        validation_rules = EXCLUDED.validation_rules,
        extraction_config = EXCLUDED.extraction_config,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    
    const result = await pool.query(query, [
      company_id,
      agent_instance_id || null,
      field_key,
      field_label,
      field_type,
      field_category || 'general',
      is_required || false,
      validation_rules ? JSON.stringify(validation_rules) : null,
      extraction_config ? JSON.stringify(extraction_config) : null
    ]);
    
    logRequest('POST', '/api/custom-fields', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/custom-fields', 500);
    handleError(res, error);
  }
});

// 5. SAVE EXTRACTED CUSTOM DATA
app.post('/api/leads/:lead_id/custom-data', async (req, res) => {
  try {
    const { lead_id } = req.params;
    const { custom_data, source, confidence_scores } = req.body;
    
    if (!custom_data || typeof custom_data !== 'object') {
      return res.status(400).json({ error: 'custom_data object is required' });
    }
    
    const saved = [];
    
    for (const [field_key, field_value] of Object.entries(custom_data)) {
      if (!field_value) continue; // Skip empty values
      
      // Get field definition
      const fieldDef = await pool.query(
        'SELECT id FROM custom_field_definitions WHERE field_key = $1 AND is_active = TRUE LIMIT 1',
        [field_key]
      );
      
      if (fieldDef.rows.length === 0) continue; // Skip undefined fields
      
      const field_definition_id = fieldDef.rows[0].id;
      const confidence = confidence_scores?.[field_key] || 0.8;
      
      // Normalize value
      let normalized = String(field_value).toLowerCase().trim();
      
      const result = await pool.query(`
        INSERT INTO lead_custom_data (
          lead_id, field_definition_id, field_key, 
          field_value, field_value_normalized, 
          source, confidence_score
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (lead_id, field_definition_id) DO UPDATE
        SET 
          field_value = EXCLUDED.field_value,
          field_value_normalized = EXCLUDED.field_value_normalized,
          source = EXCLUDED.source,
          confidence_score = EXCLUDED.confidence_score,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `, [
        lead_id,
        field_definition_id,
        field_key,
        field_value,
        normalized,
        source || 'ai_extraction',
        confidence
      ]);
      
      saved.push(result.rows[0]);
    }
    
    logRequest('POST', `/api/leads/${lead_id}/custom-data`, 201);
    res.status(201).json({ 
      success: true, 
      saved_fields: saved.length,
      data: saved 
    });
  } catch (error) {
    logRequest('POST', `/api/leads/${lead_id}/custom-data`, 500);
    handleError(res, error);
  }
});

// 6. GET LEAD CUSTOM DATA
app.get('/api/leads/:lead_id/custom-data', async (req, res) => {
  try {
    const { lead_id } = req.params;
    
    const query = `
      SELECT 
        lcd.*,
        cfd.field_label,
        cfd.field_type,
        cfd.field_category
      FROM lead_custom_data lcd
      JOIN custom_field_definitions cfd ON lcd.field_definition_id = cfd.id
      WHERE lcd.lead_id = $1
      ORDER BY cfd.display_order, cfd.field_label;
    `;
    
    const result = await pool.query(query, [lead_id]);
    
    logRequest('GET', `/api/leads/${lead_id}/custom-data`, 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/leads/${lead_id}/custom-data`, 500);
    handleError(res, error);
  }
});

// 7. SEARCH LEADS BY CUSTOM FIELD
app.get('/api/leads/search-by-custom-field', async (req, res) => {
  try {
    const { field_key, field_value, company_id } = req.query;
    
    if (!field_key || !field_value) {
      return res.status(400).json({ error: 'field_key and field_value are required' });
    }
    
    let query = `
      SELECT DISTINCT l.*
      FROM leads l
      JOIN lead_custom_data lcd ON l.id = lcd.lead_id
      WHERE lcd.field_key = $1 
      AND lcd.field_value_normalized ILIKE $2
    `;
    const params = [field_key, `%${field_value.toLowerCase()}%`];
    
    if (company_id) {
      params.push(company_id);
      query += ` AND l.company_id = $${params.length}`;
    }
    
    query += ' ORDER BY l.updated_at DESC LIMIT 50;';
    
    const result = await pool.query(query, params);
    
    logRequest('GET', '/api/leads/search-by-custom-field', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/leads/search-by-custom-field', 500);
    handleError(res, error);
  }
});




// ============================================
// GOOGLE CALENDAR VERIFICATION ENDPOINT
// ============================================
app.get('/api/calendar/verify', async (req, res) => {
  try {

    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 1); // Tomorrow
    
    // Return success if calendar node in n8n works
    res.json({
      success: true,
      message: 'Calendar integration ready',
      test_date: testDate.toISOString(),
      timezone: 'Asia/Kolkata'
    });
  } catch (error) {
    logRequest('GET', '/api/calendar/verify', 500);
    handleError(res, error);
  }
});

// ============================================
// BOOKING CONFIRMATION ENDPOINT (for n8n)
// ============================================
app.post('/api/bookings/confirm', async (req, res) => {
  try {
    const {
      lead_id,
      phone_number,
      booking_type,
      scheduled_date,
      duration_minutes,
      calendar_event_id,
      google_meet_link
    } = req.body;

    if (!lead_id || !scheduled_date) {
      return res.status(400).json({ error: 'lead_id and scheduled_date are required' });
    }

    // Create booking in DB
    const query = `
      INSERT INTO bookings 
      (lead_id, phone_number, booking_type, scheduled_date, duration_minutes, 
       status, calendar_event_id, notes)
      VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      lead_id,
      phone_number,
      booking_type || 'demo_session',
      scheduled_date,
      duration_minutes || 60,
      calendar_event_id,
      google_meet_link ? `Google Meet: ${google_meet_link}` : null
    ]);

    // Send confirmation notification
    await pool.query(`
      INSERT INTO notifications (
        lead_id, phone_number, notification_type, title, message,
        scheduled_time, delivery_channel
      )
      VALUES ($1, $2, 'booking_confirmed', 'Booking Confirmed! 🎉', $3, CURRENT_TIMESTAMP, 'whatsapp')
    `, [
      lead_id,
      phone_number,
      `Your session is confirmed for ${new Date(scheduled_date).toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}. ${google_meet_link ? `Join here: ${google_meet_link}` : 'Location details will be sent shortly.'}`
    ]);

    logRequest('POST', '/api/bookings/confirm', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/bookings/confirm', 500);
    handleError(res, error);
  }
});

// ============================================
// ERROR RECOVERY: AI FALLBACK ENDPOINT
// ============================================
app.post('/api/conversations/ai-fallback', async (req, res) => {
  try {
    const { phone_number, error_type } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    // Log AI failure
    await pool.query(`
      INSERT INTO system_notifications (
        notification_type, title, message, priority
      )
      VALUES ('error', 'AI Failure Detected', $1, 'high')
    `, [`AI failed for ${phone_number}: ${error_type}`]);

    // Send fallback message to user
    const fallbackMessage = error_type === 'timeout' 
      ? "I'm experiencing technical difficulties. A human agent will contact you shortly!"
      : "Apologies, I couldn't process that. Let me connect you with our team.";

    // Create takeover request automatically
    const leadResult = await pool.query(
      'SELECT id FROM leads WHERE phone_number = $1',
      [phone_number]
    );

    if (leadResult.rows.length > 0) {
      await pool.query(`
        INSERT INTO takeover_requests (
          lead_id, request_type, trigger_reason, priority, status
        )
        VALUES ($1, 'whatsapp_takeover', 'ai_failure', 'urgent', 'pending')
      `, [leadResult.rows[0].id]);
    }

    logRequest('POST', '/api/conversations/ai-fallback', 200);
    res.json({ 
      success: true, 
      fallback_message: fallbackMessage,
      takeover_created: leadResult.rows.length > 0
    });
  } catch (error) {
    logRequest('POST', '/api/conversations/ai-fallback', 500);
    handleError(res, error);
  }
});

// ============================================
// RATE LIMITING: CONVERSATION THROTTLE CHECK
// ============================================
const conversationRateLimits = new Map(); 

app.get('/api/conversations/rate-check/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const now = Date.now();
    const limit = 10; // messages per minute
    const window = 60000; // 1 minute

    let rateData = conversationRateLimits.get(phone);

    if (!rateData || now > rateData.resetTime) {
      rateData = { count: 0, resetTime: now + window };
      conversationRateLimits.set(phone, rateData);
    }

    rateData.count++;

    const allowed = rateData.count <= limit;

    if (!allowed) {
      // Send rate limit notification
      await pool.query(`
        INSERT INTO system_notifications (
          notification_type, title, message, priority
        )
        VALUES ('warning', 'Rate Limit Hit', $1, 'normal')
      `, [`${phone} exceeded ${limit} messages/min`]);
    }

    res.json({
      success: true,
      allowed: allowed,
      remaining: Math.max(0, limit - rateData.count),
      reset_in_seconds: Math.ceil((rateData.resetTime - now) / 1000)
    });
  } catch (error) {
    handleError(res, error);
  }
});

// ============================================
// PRODUCTION MONITORING ENDPOINT
// ============================================
app.get('/api/system/status', async (req, res) => {
  try {
    const metrics = {};
    
    // Database health
    const dbCheck = await pool.query('SELECT NOW()');
    metrics.database = { healthy: true, timestamp: dbCheck.rows[0].now };
    
    // Active conversations
    const convCount = await pool.query('SELECT COUNT(*) FROM conversations');
    metrics.conversations = { total: parseInt(convCount.rows[0].count) };
    
    // Recent errors
    const errorCount = await pool.query(`
      SELECT COUNT(*) FROM system_notifications 
      WHERE notification_type = 'error' 
      AND created_at >= NOW() - INTERVAL '1 hour'
    `);
    metrics.errors_last_hour = parseInt(errorCount.rows[0].count);
    
    // Pending takeovers
    const takeoverCount = await pool.query(`
      SELECT COUNT(*) FROM takeover_requests 
      WHERE status IN ('pending', 'assigned')
    `);
    metrics.pending_takeovers = parseInt(takeoverCount.rows[0].count);
    
    metrics.active_websocket_connections = activeConnections.size;
    
    res.json({
      success: true,
      status: metrics.errors_last_hour < 10 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      data: metrics
    });
  } catch (error) {
    handleError(res, error);
  }
});

// ============================================
// COMPANY CALLING HOURS MANAGEMENT
// ============================================
app.get('/api/companies/:company_id/calling-hours', async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const result = await pool.query(`
      SELECT metadata->>'calling_hours' as calling_hours
      FROM companies
      WHERE id = $1
    `, [company_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Default calling hours if not set
    const callingHours = result.rows[0].calling_hours || {
      start_hour: 9,
      end_hour: 18,
      timezone: 'Asia/Kolkata',
      weekdays_only: true,
      call_rate_per_minute: 2,
      max_concurrent_calls: 5
    };
    
    res.json({ success: true, data: callingHours });
  } catch (error) {
    handleError(res, error);
  }
});

app.patch('/api/companies/:company_id/calling-hours', async (req, res) => {
  try {
    const { company_id } = req.params;
    const { start_hour, end_hour, call_rate_per_minute, max_concurrent_calls } = req.body;
    
    const callingHours = {
      start_hour: start_hour || 9,
      end_hour: end_hour || 18,
      timezone: 'Asia/Kolkata',
      weekdays_only: true,
      call_rate_per_minute: call_rate_per_minute || 2,
      max_concurrent_calls: max_concurrent_calls || 5
    };
    
    await pool.query(`
      UPDATE companies
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{calling_hours}',
        $1::jsonb
      )
      WHERE id = $2
    `, [JSON.stringify(callingHours), company_id]);
    
    res.json({ success: true, data: callingHours });
  } catch (error) {
    handleError(res, error);
  }
});

// ============================================
// CLEANUP: Remove old rate limit entries every 5 minutes
// ============================================
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of conversationRateLimits.entries()) {
    if (now > data.resetTime + 300000) { // 5 min past reset
      conversationRateLimits.delete(phone);
    }
  }
}, 300000);



// 1. INITIATE OAUTH FLOW (FIXED)
app.get('/api/whatsapp/oauth/start', async (req, res) => {
  try {
    const { company_id, agent_instance_id } = req.query;
    
    if (!company_id || !agent_instance_id) {
      return res.status(400).json({ 
        success: false,
        error: 'company_id and agent_instance_id required' 
      });
    }
    
    // ✅ FIX: Store in session for callback
    req.session.oauth_state = {
      company_id: parseInt(company_id),
      agent_instance_id: parseInt(agent_instance_id),
      timestamp: Date.now()
    };
    
    // ✅ FIX: Use state parameter for security (prevents CSRF)
    const state = Buffer.from(JSON.stringify({
      company_id,
      agent_instance_id,
      nonce: Math.random().toString(36).substr(2, 9)
    })).toString('base64');
    
    const redirectUri = `${process.env.BASE_URL}/api/whatsapp/oauth/callback`;
    
    // ✅ FIX: Correct OAuth URL with all required scopes
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
      data: {  // ✅ Wrap in 'data' object
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
});

// 2. HANDLE OAUTH CALLBACK (COMPLETELY FIXED)
// app.get('/api/whatsapp/oauth/callback', async (req, res) => {
//   try {
//     const { code, state, error: oauth_error, error_description } = req.query;
    
//     // ✅ FIX: Handle OAuth errors from Facebook
//     if (oauth_error) {
//       console.error('❌ OAuth error from Facebook:', oauth_error, error_description);
//       return res.status(400).send(`
//         <!DOCTYPE html>
//         <html>
//         <head>
//           <title>Connection Failed</title>
//           <meta charset="UTF-8">
//         </head>
//         <body style="font-family: Arial; text-align: center; margin-top: 50px;">
//           <h1>❌ WhatsApp Connection Failed</h1>
//           <p><strong>Error:</strong> ${oauth_error}</p>
//           <p>${error_description || 'User cancelled authorization or permission denied'}</p>
//           <a href="/" style="color: #25D366; text-decoration: none;">← Back to Dashboard</a>
//         </body>
//         </html>
//       `);
//     }
    
//     if (!code || !state) {
//       return res.status(400).send('Invalid OAuth callback: Missing code or state');
//     }
    
//     // ✅ FIX: Decode and validate state
//     let stateData;
//     try {
//       stateData = JSON.parse(Buffer.from(state, 'base64').toString());
//     } catch (e) {
//       return res.status(400).send('Invalid state parameter');
//     }
    
//     const { company_id, agent_instance_id } = stateData;
    
//     console.log('📞 Processing OAuth callback for:', { company_id, agent_instance_id });
    
//     // STEP 1: Exchange authorization code for access token
//     const redirectUri = `${process.env.BASE_URL}/api/whatsapp/oauth/callback`;
    
//     const tokenResponse = await axios.post(
//       'https://graph.facebook.com/v21.0/oauth/access_token',
//       null,
//       {
//         params: {
//           client_id: process.env.META_APP_ID,
//           client_secret: process.env.META_APP_SECRET,
//           code: code,
//           redirect_uri: redirectUri
//         },
//         timeout: 10000
//       }
//     );
    
//     const accessToken = tokenResponse.data.access_token;
//     console.log('✅ Access token obtained');
    
//     // ✅ FIX: STEP 2 - Get WABA ID using correct endpoint
//     const debugResponse = await axios.get(
//       'https://graph.facebook.com/v21.0/debug_token',
//       {
//         params: {
//           input_token: accessToken,
//           access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`
//         },
//         timeout: 10000
//       }
//     );
    
//     // Extract granted scopes
//     const grantedScopes = debugResponse.data.data.granular_scopes || [];
//     console.log('✅ Granted scopes:', grantedScopes.map(s => s.scope));
    
//     // ✅ FIX: STEP 3 - Get WhatsApp Business Account ID
//     const businessResponse = await axios.get(
//       'https://graph.facebook.com/v21.0/me/businesses',
//       {
//         params: { access_token: accessToken },
//         timeout: 10000
//       }
//     );
    
//     if (!businessResponse.data.data || businessResponse.data.data.length === 0) {
//       throw new Error('No business accounts found. Please create a WhatsApp Business Account first.');
//     }
    
//     const businessAccountId = businessResponse.data.data[0].id;
//     console.log('✅ Business Account ID:', businessAccountId);
    
//     // ✅ FIX: STEP 4 - Get WhatsApp Business Account (WABA)
//     const wabaResponse = await axios.get(
//       `https://graph.facebook.com/v21.0/${businessAccountId}/client_whatsapp_business_accounts`,
//       {
//         params: { access_token: accessToken },
//         timeout: 10000
//       }
//     );
    
//     if (!wabaResponse.data.data || wabaResponse.data.data.length === 0) {
//       throw new Error('No WhatsApp Business Accounts found. Please set up WhatsApp in Meta Business Manager first.');
//     }
    
//     const wabaId = wabaResponse.data.data[0].id;
//     console.log('✅ WABA ID:', wabaId);
    
//     // ✅ FIX: STEP 5 - Get phone numbers from WABA
//     const phoneResponse = await axios.get(
//       `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers`,
//       {
//         params: { access_token: accessToken },
//         timeout: 10000
//       }
//     );
    
//     if (!phoneResponse.data.data || phoneResponse.data.data.length === 0) {
//       throw new Error('No phone numbers found. Please add a phone number to your WhatsApp Business Account.');
//     }
    
//     const phoneData = phoneResponse.data.data[0];
//     const phoneNumberId = phoneData.id;
//     const displayPhoneNumber = phoneData.display_phone_number;
//     const verifiedName = phoneData.verified_name;
    
//     console.log('✅ Phone Number:', displayPhoneNumber, 'ID:', phoneNumberId);
    
//     // ✅ FIX: Generate unique verify token
//     const verifyToken = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
    
//     // ✅ FIX: STEP 6 - Save credentials to database with proper JSON structure
//     // const updateResult = await pool.query(`
//     //   UPDATE agent_instances
//     //   SET 
//     //     whatsapp_number = $1,
//     //     whatsapp_credentials = $2::jsonb,
//     //     webhook_verify_token = $3,
//     //     token_expires_at = NOW() + INTERVAL '60 days',
//     //     updated_at = CURRENT_TIMESTAMP
//     //   WHERE id = $4 AND company_id = $5
//     //   RETURNING id, agent_name
//     // `, [
//     //   displayPhoneNumber,
//     //   JSON.stringify({
//     //     access_token: accessToken,
//     //     phone_number_id: phoneNumberId,
//     //     business_account_id: businessAccountId,
//     //     waba_id: wabaId,
//     //     verified_name: verifiedName,
//     //     connected_at: new Date().toISOString()
//     //   }),
//     //   verifyToken,
//     //   agent_instance_id,
//     //   company_id
//     // ]);


//     const updateResult = await pool.query(`
//       UPDATE agent_instances
//       SET 
//         whatsapp_number = $1,
//         whatsapp_credentials = $2::jsonb,
//         // webhook_verify_token = $3,
//         token_expires_at = NOW() + INTERVAL '60 days',
//         updated_at = CURRENT_TIMESTAMP
//       WHERE id = $4 AND company_id = $5
//       RETURNING id, agent_name
//     `, [
//       displayPhoneNumber,
//       JSON.stringify({
//         access_token: accessToken,
//         phone_number_id: phoneNumberId,
//         business_account_id: businessAccountId,
//         waba_id: wabaId,
//         verified_name: verifiedName,
//         connected_at: new Date().toISOString()
//       }),
//       // verifyToken,
//       agent_instance_id,
//       company_id
//     ]);
    
//     if (updateResult.rows.length === 0) {
//       throw new Error('Agent instance not found or company_id mismatch');
//     }
    
//     console.log('✅ Credentials saved to database');
//     logRequest('GET', '/api/whatsapp/oauth/callback', 200);
    
//     // ✅ FIX: STEP 7 - Return beautiful success page with clear instructions
//     const webhookUrl = `${process.env.BASE_URL}/api/webhooks/whatsapp-universal`;
//     const agentName = updateResult.rows[0].agent_name;
    
//     res.send(`
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <title>WhatsApp Connected ✅</title>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <style>
//           * { margin: 0; padding: 0; box-sizing: border-box; }
//           body { 
//             font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
//             background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//             min-height: 100vh;
//             padding: 20px;
//             display: flex;
//             align-items: center;
//             justify-content: center;
//           }
//           .container {
//             background: white;
//             max-width: 700px;
//             width: 100%;
//             border-radius: 20px;
//             box-shadow: 0 20px 60px rgba(0,0,0,0.3);
//             overflow: hidden;
//           }
//           .header {
//             background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
//             color: white;
//             padding: 40px;
//             text-align: center;
//           }
//           .header h1 {
//             font-size: 2em;
//             margin-bottom: 10px;
//           }
//           .content {
//             padding: 40px;
//           }
//           .success-badge {
//             background: #d4edda;
//             color: #155724;
//             padding: 15px;
//             border-radius: 10px;
//             margin-bottom: 30px;
//             border-left: 4px solid #28a745;
//           }
//           .info-box {
//             background: #f8f9fa;
//             padding: 20px;
//             border-radius: 10px;
//             margin: 20px 0;
//           }
//           .info-box strong {
//             color: #495057;
//             display: block;
//             margin-bottom: 10px;
//           }
//           .code-box {
//             background: #f1f3f5;
//             border: 2px dashed #dee2e6;
//             padding: 15px;
//             border-radius: 8px;
//             font-family: 'Courier New', monospace;
//             font-size: 13px;
//             word-break: break-all;
//             cursor: pointer;
//             transition: all 0.3s;
//           }
//           .code-box:hover {
//             background: #e9ecef;
//             border-color: #adb5bd;
//           }
//           .step {
//             margin: 30px 0;
//             padding: 20px;
//             background: #fff;
//             border-left: 4px solid #667eea;
//             border-radius: 5px;
//           }
//           .step h3 {
//             color: #667eea;
//             margin-bottom: 15px;
//           }
//           .step ol {
//             margin-left: 20px;
//             line-height: 1.8;
//           }
//           .btn {
//             display: inline-block;
//             background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//             color: white;
//             padding: 15px 40px;
//             border: none;
//             border-radius: 10px;
//             text-decoration: none;
//             font-weight: bold;
//             margin: 10px 5px;
//             cursor: pointer;
//             transition: transform 0.2s;
//           }
//           .btn:hover {
//             transform: translateY(-2px);
//             box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
//           }
//           .btn-secondary {
//             background: #6c757d;
//           }
//           .warning {
//             background: #fff3cd;
//             border-left: 4px solid #ffc107;
//             padding: 15px;
//             border-radius: 5px;
//             margin: 20px 0;
//           }
//           .copy-btn {
//             background: #28a745;
//             color: white;
//             border: none;
//             padding: 8px 15px;
//             border-radius: 5px;
//             cursor: pointer;
//             font-size: 12px;
//             margin-top: 10px;
//           }
//           .copy-btn:hover {
//             background: #218838;
//           }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>✅ WhatsApp Connected!</h1>
//             <p>Your WhatsApp Business is now integrated</p>
//           </div>
          
//           <div class="content">
//             <div class="success-badge">
//               <strong>🎉 Connection Successful</strong>
//               <p style="margin-top: 5px;">Agent "${agentName}" is connected to WhatsApp number <strong>${displayPhoneNumber}</strong></p>
//             </div>
            
//             <div class="info-box">
//               <strong>📋 Connection Details:</strong>
//               <p><strong>Phone:</strong> ${displayPhoneNumber}</p>
//               <p><strong>Verified Name:</strong> ${verifiedName}</p>
//               <p><strong>Status:</strong> <span style="color: #28a745;">● Active</span></p>
//             </div>
            
//             <div class="warning">
//               <strong>⚠️ One Final Step Required</strong>
//               <p style="margin-top: 10px;">To complete the setup, you must register the webhook in Meta Developer Console. This is a <strong>one-time configuration</strong>.</p>
//             </div>
            
//             <div class="step">
//               <h3>Step 1: Copy Webhook URL</h3>
//               <div class="code-box" id="webhook-url" onclick="copyToClipboard('webhook-url')">${webhookUrl}</div>
//               <button class="copy-btn" onclick="copyToClipboard('webhook-url')">📋 Copy URL</button>
//             </div>
            
//             <div class="step">
//               <h3>Step 2: Copy Verify Token</h3>
//               <div class="code-box" id="verify-token" onclick="copyToClipboard('verify-token')">${verifyToken}</div>
//               <button class="copy-btn" onclick="copyToClipboard('verify-token')">📋 Copy Token</button>
//             </div>
            
//             <div class="step">
//               <h3>Step 3: Register in Meta Console</h3>
//               <ol>
//                 <li>Open <a href="https://developers.facebook.com/apps" target="_blank" style="color: #667eea;">Meta Developer Console</a></li>
//                 <li>Select your app → <strong>WhatsApp</strong> → <strong>Configuration</strong></li>
//                 <li>In "Webhook" section, click <strong>Edit</strong></li>
//                 <li>Paste the <strong>Webhook URL</strong> (from Step 1)</li>
//                 <li>Paste the <strong>Verify Token</strong> (from Step 2)</li>
//                 <li>Click <strong>Verify and Save</strong></li>
//                 <li>Subscribe to the <strong>"messages"</strong> webhook field</li>
//               </ol>
//               <a href="https://developers.facebook.com/apps" target="_blank" class="btn">
//                 🚀 Open Meta Console
//               </a>
//             </div>
            
//             <div style="text-align: center; margin-top: 40px;">
//               <a href="/" class="btn">← Back to Dashboard</a>
//             </div>
//           </div>
//         </div>
        
//         <script>
//           function copyToClipboard(elementId) {
//             const element = document.getElementById(elementId);
//             const text = element.textContent;
            
//             navigator.clipboard.writeText(text).then(() => {
//               const originalBg = element.style.background;
//               element.style.background = '#d4edda';
//               element.textContent = '✅ Copied!';
              
//               setTimeout(() => {
//                 element.style.background = originalBg;
//                 element.textContent = text;
//               }, 2000);
//             }).catch(err => {
//               alert('Failed to copy. Please select and copy manually.');
//             });
//           }
//         </script>
//       </body>
//       </html>
//     `);
    
//   } catch (error) {
//     // console.error('❌ OAuth callback error:', error.response?.data || error.message);
//     console.error('OAuth callback error:', {
//       message: error.message,
//       response: error.response?.data,
//       status: error.response?.status,
//       config: {
//         url: error.config?.url,
//         method: error.config?.method
//       }
//     });
//     logRequest('GET', '/api/whatsapp/oauth/callback', 500);
    
//     res.status(500).send(`
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <title>Connection Failed</title>
//         <meta charset="UTF-8">
//         <style>
//           body { 
//             font-family: Arial; 
//             text-align: center; 
//             margin: 50px;
//             background: #f8f9fa;
//           }
//           .error-box {
//             background: white;
//             padding: 40px;
//             border-radius: 10px;
//             max-width: 600px;
//             margin: 0 auto;
//             box-shadow: 0 2px 10px rgba(0,0,0,0.1);
//           }
//           h1 { color: #dc3545; }
//           .error-details {
//             background: #f8d7da;
//             padding: 15px;
//             border-radius: 5px;
//             margin: 20px 0;
//             text-align: left;
//           }
//         </style>
//       </head>
//       <body>
//         <div class="error-box">
//           <h1>❌ WhatsApp Connection Failed</h1>
//           <div class="error-details">
//             <strong>Error:</strong><br>
//             ${error.message}
//           </div>
//           <p>Please try again or contact support if the problem persists.</p>
//           <a href="/" style="color: #667eea; text-decoration: none; font-weight: bold;">← Back to Dashboard</a>
//         </div>
//       </body>
//       </html>
//     `);
//   }
// });


// ✅ FINAL WORKING VERSION - Tested in both Dev and Live modes
app.get('/api/whatsapp/oauth/callback', async (req, res) => {
  try {
    const { code, state, error: oauth_error, error_description } = req.query;
    
    // Handle OAuth errors
    if (oauth_error) {
      console.error('❌ OAuth error from Facebook:', oauth_error, error_description);
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Connection Failed</title></head>
        <body style="font-family: Arial; text-align: center; margin-top: 50px;">
          <h1>❌ WhatsApp Connection Failed</h1>
          <p><strong>Error:</strong> ${oauth_error}</p>
          <p>${error_description || 'User cancelled authorization'}</p>
          <a href="/" style="color: #25D366;">← Back to Dashboard</a>
        </body>
        </html>
      `);
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
    
    // ============================================
    // STEP 1: Exchange code for access token
    // ============================================
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
    
    // ============================================
    // STEP 2: Get token debug info (contains WABA in scopes)
    // ============================================
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
    
    // ============================================
    // STEP 3: Extract WABA ID from granted scopes
    // ============================================
    let wabaId = null;
    
    // Method 1: From granular_scopes.target_ids (most reliable)
    for (const scope of grantedScopes) {
      if (scope.scope === 'whatsapp_business_messaging' || 
          scope.scope === 'whatsapp_business_management') {
        if (scope.target_ids && scope.target_ids.length > 0) {
          wabaId = scope.target_ids[0];
          console.log('✅ WABA ID from scopes:', wabaId);
          break;
        }
      }
    }
    
    // Method 2: Fallback - Try direct WABA query (works in Live mode)
    if (!wabaId) {
      console.log('⚠️ WABA not in scopes, trying direct query...');
      
      try {
        const directWabaResponse = await axios.get(
          'https://graph.facebook.com/v21.0/me',
          {
            params: {
              access_token: accessToken,
              fields: 'whatsapp_business_account'
            },
            timeout: 10000
          }
        );
        
        if (directWabaResponse.data.whatsapp_business_account) {
          wabaId = directWabaResponse.data.whatsapp_business_account.id;
          console.log('✅ WABA ID from direct query:', wabaId);
        }
      } catch (err) {
        console.log('⚠️ Direct WABA query failed:', err.message);
      }
    }
    
    // If still no WABA, show helpful error
    if (!wabaId) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Setup Required</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px; background: #f8f9fa;">
          <div style="background: white; padding: 40px; border-radius: 10px; max-width: 700px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h1 style="color: #ff9800;">⚠️ Additional Setup Required</h1>
            <div style="background: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: left;">
              <p><strong>Your app is in Development Mode.</strong></p>
              <p style="margin-top: 15px;">To complete the setup:</p>
              <ol style="text-align: left; line-height: 2;">
                <li><strong>Go to Meta Developer Console</strong></li>
                <li>Select your app → <strong>WhatsApp</strong> → <strong>API Setup</strong></li>
                <li><strong>Add a phone number</strong> to your WhatsApp Business Account</li>
                <li><strong>Add test numbers</strong> in the Test Numbers section</li>
                <li>Then try connecting again</li>
              </ol>
            </div>
            <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: left;">
              <strong>📚 Need Help?</strong>
              <p style="margin-top: 10px;">
                Check Meta's guide: 
                <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank">
                  WhatsApp Cloud API Setup
                </a>
              </p>
            </div>
            <a href="https://developers.facebook.com/apps/${process.env.META_APP_ID}/whatsapp-business/wa-dev-console/" 
               target="_blank" 
               style="display: inline-block; background: #25D366; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; margin: 20px 10px;">
              🚀 Open WhatsApp Console
            </a>
            <a href="/" 
               style="display: inline-block; background: #6c757d; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; margin: 20px 10px;">
              ← Back to Dashboard
            </a>
          </div>
        </body>
        </html>
      `);
    }
    
    // ============================================
    // STEP 4: Get phone numbers from WABA
    // ============================================
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
    
    console.log('✅ Phone Response:', phoneResponse.data);
    
    if (!phoneResponse.data.data || phoneResponse.data.data.length === 0) {
      throw new Error('No phone numbers found. Please add a phone number to your WhatsApp Business Account in Meta Console.');
    }
    
    const phoneData = phoneResponse.data.data[0];
    const phoneNumberId = phoneData.id;
    const displayPhoneNumber = phoneData.display_phone_number;
    const verifiedName = phoneData.verified_name || 'Business';
    
    console.log('✅ Phone Number:', displayPhoneNumber, 'ID:', phoneNumberId);
    
    // ============================================
    // STEP 5: Get Business Account ID (optional, for reference)
    // ============================================
    let businessAccountId = null;
    try {
      const businessResponse = await axios.get(
        'https://graph.facebook.com/v21.0/me/businesses',
        {
          params: { access_token: accessToken },
          timeout: 10000
        }
      );
      
      if (businessResponse.data.data && businessResponse.data.data.length > 0) {
        businessAccountId = businessResponse.data.data[0].id;
        console.log('✅ Business Account ID:', businessAccountId);
      }
    } catch (err) {
      console.log('⚠️ Could not fetch business account (non-critical):', err.message);
    }
    
    // ============================================
    // STEP 6: Save to database
    // ============================================
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
    
    // ============================================
    // STEP 7: Success page with webhook instructions
    // ============================================
    const webhookUrl = `${process.env.BASE_URL}/api/webhooks/whatsapp-universal`;
    const agentName = updateResult.rows[0].agent_name;
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp Connected ✅</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            max-width: 700px;
            width: 100%;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
            color: white;
            padding: 40px;
            text-align: center;
          }
          .header h1 { font-size: 2em; margin-bottom: 10px; }
          .content { padding: 40px; }
          .success-badge {
            background: #d4edda;
            color: #155724;
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 30px;
            border-left: 4px solid #28a745;
          }
          .info-box {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
          }
          .code-box {
            background: #f1f3f5;
            border: 2px dashed #dee2e6;
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 13px;
            word-break: break-all;
            cursor: pointer;
            transition: all 0.3s;
          }
          .code-box:hover { background: #e9ecef; }
          .step {
            margin: 30px 0;
            padding: 20px;
            background: #fff;
            border-left: 4px solid #667eea;
            border-radius: 5px;
          }
          .step h3 { color: #667eea; margin-bottom: 15px; }
          .step ol { margin-left: 20px; line-height: 1.8; }
          .btn {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 40px;
            border: none;
            border-radius: 10px;
            text-decoration: none;
            font-weight: bold;
            margin: 10px 5px;
            cursor: pointer;
          }
          .copy-btn {
            background: #28a745;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 12px;
            margin-top: 10px;
          }
          .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ WhatsApp Connected!</h1>
            <p>Your WhatsApp Business is now integrated</p>
          </div>
          
          <div class="content">
            <div class="success-badge">
              <strong>🎉 Connection Successful</strong>
              <p style="margin-top: 5px;">Agent "${agentName}" is connected to <strong>${displayPhoneNumber}</strong></p>
            </div>
            
            <div class="info-box">
              <strong>📋 Connection Details:</strong>
              <p><strong>Phone:</strong> ${displayPhoneNumber}</p>
              <p><strong>Name:</strong> ${verifiedName}</p>
              <p><strong>WABA ID:</strong> ${wabaId}</p>
              <p><strong>Status:</strong> <span style="color: #28a745;">● Active</span></p>
            </div>
            
            <div class="warning">
              <strong>⚠️ Final Step: Register Webhook</strong>
              <p style="margin-top: 10px;">To receive messages, configure the webhook in Meta Console.</p>
            </div>
            
            <div class="step">
              <h3>Step 1: Copy Webhook URL</h3>
              <div class="code-box" id="webhook-url">${webhookUrl}</div>
              <button class="copy-btn" onclick="copyToClipboard('webhook-url')">📋 Copy</button>
            </div>
            
            <div class="step">
              <h3>Step 2: Copy Verify Token</h3>
              <div class="code-box" id="verify-token">${verifyToken}</div>
              <button class="copy-btn" onclick="copyToClipboard('verify-token')">📋 Copy</button>
            </div>
            
            <div class="step">
              <h3>Step 3: Configure in Meta</h3>
              <ol>
                <li>Open <a href="https://developers.facebook.com/apps/${process.env.META_APP_ID}/whatsapp-business/wa-settings/" target="_blank" style="color: #667eea;">WhatsApp Settings</a></li>
                <li>Scroll to <strong>Webhook</strong> section</li>
                <li>Click <strong>Edit</strong></li>
                <li>Paste Webhook URL and Verify Token</li>
                <li>Click <strong>Verify and Save</strong></li>
                <li>Subscribe to <strong>messages</strong> field</li>
              </ol>
              <a href="https://developers.facebook.com/apps/${process.env.META_APP_ID}/whatsapp-business/wa-settings/" target="_blank" class="btn">🚀 Open Settings</a>
            </div>
            
            <div style="text-align: center; margin-top: 40px;">
              <a href="/" class="btn">← Dashboard</a>
            </div>
          </div>
        </div>
        
        <script>
          function copyToClipboard(id) {
            const el = document.getElementById(id);
            const text = el.textContent;
            navigator.clipboard.writeText(text).then(() => {
              const bg = el.style.background;
              el.style.background = '#d4edda';
              el.textContent = '✅ Copied!';
              setTimeout(() => {
                el.style.background = bg;
                el.textContent = text;
              }, 2000);
            });
          }
        </script>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('❌ OAuth callback error:', error.response?.data || error.message);
    logRequest('GET', '/api/whatsapp/oauth/callback', 500);
    
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Connection Failed</title></head>
      <body style="font-family: Arial; text-align: center; margin: 50px; background: #f8f9fa;">
        <div style="background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h1 style="color: #dc3545;">❌ Connection Failed</h1>
          <div style="background: #f8d7da; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: left;">
            <strong>Error:</strong><br>${error.message}
          </div>
          <p>Try again or contact support.</p>
          <a href="/" style="color: #667eea; font-weight: bold; text-decoration: none;">← Back</a>
        </div>
      </body>
      </html>
    `);
  }
});

// 3. GET OAUTH STATUS (ENHANCED)
app.get('/api/whatsapp/oauth/status/:agent_instance_id', async (req, res) => {
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
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// 4. DISCONNECT WHATSAPP (ENHANCED)
app.delete('/api/whatsapp/oauth/disconnect/:agent_instance_id', async (req, res) => {
  try {
    const { agent_instance_id } = req.params;
    
    const currentResult = await pool.query(
      'SELECT whatsapp_credentials FROM agent_instances WHERE id = $1',
      [agent_instance_id]
    );
    
    if (currentResult.rows.length > 0) {
      const creds = currentResult.rows[0].whatsapp_credentials;

    }
    
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
    
    res.json({ 
      success: true, 
      message: 'WhatsApp disconnected successfully'
    });
    
  } catch (error) {
    console.error('Disconnect error:', error);
    logRequest('DELETE', `/api/whatsapp/oauth/disconnect/${req.params.agent_instance_id}`, 500);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});







// ============================================
// WHATSAPP WEBHOOK RECEIVER (SINGLE ENDPOINT FOR ALL CLIENTS)
// ============================================

// app.post('/api/webhooks/whatsapp-universal', async (req, res) => {
//   try {
//     const { entry } = req.body;

//     // Verify webhook (Meta requires this)
//     if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token']) {
//       const verifyToken = req.query['hub.verify_token'];
//       const agent = await pool.query(
//         'SELECT id FROM agent_instances WHERE webhook_verify_token = $1',
//         [verifyToken]
//       );

//       if (agent.rows.length > 0) {
//         return res.send(req.query['hub.challenge']);
//       }
//       return res.status(403).send('Invalid verify token');
//     }

//     // Process incoming message
//     for (const change of entry[0].changes) {
//       if (change.field !== 'messages') continue;

//       const message = change.value.messages[0];
//       const fromPhone = message.from;
//       const toPhone = change.value.metadata.display_phone_number;
//       const normalizedToPhone = toPhone.startsWith('+') ? toPhone : `+${toPhone}`;

//       // 1️⃣ Identify which client owns this WhatsApp number
//       const agentResult = await pool.query(`
//         SELECT 
//           ai.*, 
//           ai.whatsapp_credentials,
//           ac.prompt_preamble,
//           ac.initial_message,
//           c.name as company_name
//         FROM agent_instances ai
//         LEFT JOIN agent_configs ac ON ai.agent_config_id = ac.id
//         LEFT JOIN companies c ON ai.company_id = c.id
//         WHERE ai.whatsapp_number = $1 
//           AND ai.agent_type = 'whatsapp' 
//           AND ai.is_active = TRUE
//       `, [normalizedToPhone]);

//       if (agentResult.rows.length === 0) {
//         console.log('⚠️ Unknown WhatsApp number:', toPhone);
//         return res.sendStatus(404);
//       }

//       const agentInstance = agentResult.rows[0];
//       const text = message.text?.body || '';

//       // ============================================
//       // ✅ NEW SECTION: Store incoming user message
//       // ============================================

//       try {
//         // 1. Get or create lead
//         const phone = '+' + fromPhone;
//         let leadRes = await pool.query(
//           'SELECT id FROM leads WHERE phone_number = $1;',
//           [phone]
//         );

//         let leadId;
//         if (leadRes.rows.length === 0) {
//           const newLead = await pool.query(
//             `INSERT INTO leads (phone_number, name, lead_source, last_contacted)
//              VALUES ($1, $2, 'whatsapp', NOW()) RETURNING id;`,
//             [phone, message.profile?.name || 'Unknown']
//           );
//           leadId = newLead.rows[0].id;
//         } else {
//           leadId = leadRes.rows[0].id;
//           await pool.query(`UPDATE leads SET last_contacted = NOW() WHERE id = $1;`, [leadId]);
//         }

//         // 2. Get or create conversation
//         let convRes = await pool.query(
//           'SELECT id FROM conversations WHERE lead_id = $1;',
//           [leadId]
//         );

//         let convId;
//         if (convRes.rows.length === 0) {
//           const newConv = await pool.query(
//             `INSERT INTO conversations (lead_id, phone_number, conversation_history)
//              VALUES ($1, $2, $3) RETURNING id;`,
//             [leadId, phone, text]
//             // [leadId, phone]
//           );
//           convId = newConv.rows[0].id;
//         } else {
//           convId = convRes.rows[0].id;
//         }

//         // 3. Insert message record
//         await pool.query(
//           `INSERT INTO whatsapp_messages 
//            (conversation_id, lead_id, phone_number, message_type, message_body, sender, message_id, is_from_user)
//            VALUES ($1, $2, $3, 'text', $4, 'user', $5, TRUE);`,
//           [convId, leadId, phone, text, message.id || `usr_${Date.now()}`]
//         );
//       } catch (err) {
//         console.error('⚠️ DB insert error for user message:', err);
//       }

//       // ============================================
//       // ✅ EXISTING SECTION: Forward to n8n
//       // ============================================
//       await axios.post(
//         process.env.N8N_WHATSAPP_WEBHOOK_URL,
//         {
//           message: {
//             from: fromPhone,
//             text: { body: text },
//             type: message.type
//           },
//           contacts: [{ profile: { name: message.profile?.name || 'Unknown' } }],
//           agent_instance: {
//             id: agentInstance.id,
//             company_id: agentInstance.company_id,
//             phone_number: agentInstance.whatsapp_number,
//             prompt: agentInstance.custom_prompt || agentInstance.prompt_preamble,
//             credentials: agentInstance.whatsapp_credentials
//           }
//         }
//       );
//     }

//     res.sendStatus(200);
//   } catch (error) {
//     console.error('❌ WhatsApp webhook error:', error);
//     res.sendStatus(500);
//   }
// });



// ============================================
// WHATSAPP WEBHOOK RECEIVER (SINGLE ENDPOINT FOR ALL CLIENTS)
// ============================================

app.post('/api/webhooks/whatsapp-universal', async (req, res) => {
  try {
    const { entry } = req.body;

    // ✅ FIX 2: Add this check
    if (!entry || entry.length === 0) {
      return res.sendStatus(200);
    }

    // Verify webhook (Meta requires this)
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token']) {
      const verifyToken = req.query['hub.verify_token'];
      const agent = await pool.query(
        'SELECT id FROM agent_instances WHERE webhook_verify_token = $1',
        [verifyToken]
      );

      if (agent.rows.length > 0) {
        return res.send(req.query['hub.challenge']);
      }
      return res.status(403).send('Invalid verify token');
    }

    // Process incoming message
    for (const change of entry[0].changes) {
      if (change.field !== 'messages') continue;

      const message = change.value.messages[0];
      if (!message) continue;
      const fromPhone = message.from;
      const toPhone = change.value.metadata.display_phone_number;
      const normalizedToPhone = toPhone.startsWith('+') ? toPhone : `+${toPhone}`;
      const normalizedFromPhone = fromPhone.startsWith('+') ? fromPhone : `+${fromPhone}`;

      // 1️⃣ Identify which client owns this WhatsApp number
      const agentResult = await pool.query(`
        SELECT 
          ai.*, 
          ai.whatsapp_credentials,
          ac.prompt_preamble,
          ac.initial_message,
          c.name as company_name
        FROM agent_instances ai
        LEFT JOIN agent_configs ac ON ai.agent_config_id = ac.id
        LEFT JOIN companies c ON ai.company_id = c.id
        WHERE ai.whatsapp_number = $1 
          AND ai.agent_type = 'whatsapp' 
          AND ai.is_active = TRUE
      `, [normalizedToPhone]);

      if (agentResult.rows.length === 0) {
        console.log('⚠️ Unknown WhatsApp number:', toPhone);
        return res.sendStatus(404);
      }

      const agentInstance = agentResult.rows[0];
      const text = message.text?.body || '';


      // Handle multi-language
      const languageData = await handleMultilingualWhatsAppMessage(
        text, 
        agentInstance, 
        normalizedFromPhone
      );

      // ============================================
      // ✅ Store incoming user message in database
      // ============================================

      try {
        // 1. Get or create lead
        const phone = '+' + fromPhone;
        let leadRes = await pool.query(
          'SELECT id FROM leads WHERE phone_number = $1;',
          [phone]
        );

        let leadId;
        if (leadRes.rows.length === 0) {
          const newLead = await pool.query(
            `INSERT INTO leads (phone_number, name, lead_source, last_contacted)
             VALUES ($1, $2, 'whatsapp', NOW()) RETURNING id;`,
            [phone, message.profile?.name || 'Unknown']
          );
          leadId = newLead.rows[0].id;
        } else {
          leadId = leadRes.rows[0].id;
          await pool.query(`UPDATE leads SET last_contacted = NOW() WHERE id = $1;`, [leadId]);
        }

        // 2. Get or create conversation
        let convRes = await pool.query(
          'SELECT id FROM conversations WHERE lead_id = $1;',
          [leadId]
        );

        let convId;
        if (convRes.rows.length === 0) {
          const newConv = await pool.query(
            `INSERT INTO conversations (lead_id, phone_number, conversation_history)
             VALUES ($1, $2, $3) RETURNING id;`,
            [leadId, phone, text]
          );
          convId = newConv.rows[0].id;
        } else {
          convId = convRes.rows[0].id;
        }

        // 3. Insert message record
        await pool.query(
          `INSERT INTO whatsapp_messages 
           (conversation_id, lead_id, phone_number, message_type, message_body, sender, message_id, is_from_user)
           VALUES ($1, $2, $3, 'text', $4, 'user', $5, TRUE);`,
          [convId, leadId, phone, text, message.id || `usr_${Date.now()}`]
        );

        // Auto-summarize if needed
        try {
          await autoSummarizeIfNeeded(convId);
        } catch (summaryError) {
          console.error('Auto-summarize failed:', summaryError);
        }
      } catch (err) {
        console.error('⚠️ DB insert error for user message:', err);
      }
      
      // 🔧 FIX 1: Use correct n8n webhook URL (from workflow)
      const n8nWebhookUrl = process.env.N8N_WHATSAPP_WEBHOOK_URL || 
                            'https://n8n-render-host-n0ym.onrender.com/webhook/whatsapp-trigger';
      
      console.log('🔄 Forwarding to n8n:', n8nWebhookUrl);

      try {
        const n8nResponse = await axios.post(
          n8nWebhookUrl,
          {
            message: {
              from: fromPhone,
              text: { body: text },
              type: message.type
            },
            contacts: [{ profile: { name: message.profile?.name || 'Unknown' } }],
            agent_instance: {
              id: agentInstance.id,
              company_id: agentInstance.company_id,
              phone_number: agentInstance.whatsapp_number,
              prompt: agentInstance.custom_prompt || agentInstance.prompt_preamble,
              credentials: agentInstance.whatsapp_credentials
            }
          },
          {
            timeout: 30000, // 30 second timeout
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        console.log('✅ n8n webhook successful:', n8nResponse.status);
        
      } catch (n8nError) {
        // 🔧 FIX 2: Better error handling - don't crash the webhook
        console.error('❌ n8n webhook error:', {
          status: n8nError.response?.status,
          statusText: n8nError.response?.statusText,
          data: n8nError.response?.data,
          message: n8nError.message
        });

        // 🔧 FIX 3: If n8n fails, send fallback response directly via WhatsApp
        if (n8nError.response?.status === 404) {
          console.error('🚨 CRITICAL: n8n webhook not found. Check these:');
          console.error('1. Is n8n workflow activated?');
          console.error('2. Is webhook URL correct?', n8nWebhookUrl);
          console.error('3. Check n8n workflow webhook node settings');
          
          // Send fallback message
          try {
            await axios.post(
              'https://noily-deena-ancestrally.ngrok-free.dev/api/whatsapp/send',
              {
                to: fromPhone,
                message: "Hi! We're experiencing technical difficulties. Our team will get back to you shortly. 🙏",
                agent_instance_id: agentInstance.id
              }
            );
            console.log('✅ Sent fallback message to user');
          } catch (fallbackError) {
            console.error('❌ Failed to send fallback message:', fallbackError.message);
          }
        }
        
        // Don't throw - continue processing
      }
    }

    // ✅ Always return 200 to WhatsApp to prevent retries
    res.sendStatus(200);
    
  } catch (error) {
    console.error('❌ WhatsApp webhook error:', error);
    // ✅ Still return 200 to prevent WhatsApp from retrying
    res.sendStatus(200);
  }
});





// Meta will call this GET endpoint to verify your webhook
app.get('/api/webhooks/whatsapp-universal', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];


  if (mode && token) {
    // 🆕 CHANGED: Use hardcoded token instead of database lookup
    if (token === WEBHOOK_VERIFY_TOKEN) {
      console.log('✅ Webhook verified successfully with hardcoded token!');
      return res.status(200).send(challenge);
    } else {
      console.log('❌ Invalid verify token:', token);
      return res.sendStatus(403);
    }
  }

  res.sendStatus(400);
});

// ============================================
// SEND WHATSAPP MESSAGE (DYNAMIC CREDENTIALS)
// ============================================

app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { to, message, agent_instance_id } = req.body;

    if (!to || !message || !agent_instance_id) {
      return res.status(400).json({ error: 'to, message, and agent_instance_id required' });
    }

    // Get agent credentials
    const agent = await pool.query(
      'SELECT whatsapp_credentials FROM agent_instances WHERE id = $1',
      [agent_instance_id]
    );

    if (agent.rows.length === 0) {
      return res.status(404).json({ error: 'Agent instance not found' });
    }

    const credentials = agent.rows[0].whatsapp_credentials;

    // Send via Meta API
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

    logRequest('POST', '/api/whatsapp/send', 200);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('WhatsApp send error:', error.response?.data || error);
    logRequest('POST', '/api/whatsapp/send', 500);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CLIENT ONBOARDING: SAVE WHATSAPP CREDENTIALS
// ============================================

app.post('/api/agent-instances/:id/whatsapp-credentials', async (req, res) => {
  try {
    const { id } = req.params;
    const { access_token, phone_number_id, business_account_id } = req.body;

    if (!access_token || !phone_number_id) {
      return res.status(400).json({ error: 'access_token and phone_number_id required' });
    }

    // Generate unique verify token
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
      webhook_url: `${process.env.BASE_URL}/api/webhooks/whatsapp-universal`,
      verify_token: verifyToken
    });
  } catch (error) {
    logRequest('POST', `/api/agent-instances/${id}/whatsapp-credentials`, 500);
    handleError(res, error);
  }
});



// Backend: Handle Meta OAuth callback
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  const companyId = req.session.companyId; // From logged-in client

  // Exchange code for access token
  const tokenResponse = await axios.post('https://graph.facebook.com/v21.0/oauth/access_token', {
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    code: code,
    redirect_uri: `${process.env.APP_URL}/callback`
  });

  const accessToken = tokenResponse.data.access_token;

  // Get WhatsApp Business Phone Number
  const wabaResponse = await axios.get(`https://graph.facebook.com/v21.0/me/phone_numbers`, {
    params: { access_token: accessToken }
  });

  const phoneNumberId = wabaResponse.data.data[0].id;
  const phoneNumber = wabaResponse.data.data[0].display_phone_number;

  // Save to agent_instances
  await axios.post(`${process.env.API_URL}/api/agent-instances`, {
    company_id: companyId,
    agent_name: 'WhatsApp Agent',
    agent_type: 'whatsapp',
    whatsapp_number: phoneNumber,
    is_active: true
  });

  // Save credentials
  await axios.post(`${process.env.API_URL}/api/agent-instances/${agentId}/whatsapp-credentials`, {
    access_token: accessToken,
    phone_number_id: phoneNumberId
  });

  res.redirect('/dashboard?success=true');
});





// ============================================
// CAMPAIGNS ENDPOINTS (Add after existing campaign endpoints)
// ============================================

// Get campaigns for company
app.get('/api/campaigns', async (req, res) => {
  try {
    const { company_id } = req.query;
    
    let query = 'SELECT * FROM campaigns WHERE 1=1';
    const params = [];
    
    if (company_id) {
      params.push(parseInt(company_id));
      query += ` AND company_id = $${params.length}`;
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    
    logRequest('GET', '/api/campaigns', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/campaigns', 500);
    handleError(res, error);
  }
});

// ============================================
// BULK SEND WHATSAPP MESSAGE
// ============================================

app.post('/api/whatsapp/send-bulk', async (req, res) => {
  try {
    const { agent_instance_id, messages } = req.body;
    
    if (!agent_instance_id || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        error: 'agent_instance_id and messages array required' 
      });
    }
    
    // Get agent credentials
    const agent = await pool.query(
      'SELECT whatsapp_credentials FROM agent_instances WHERE id = $1',
      [agent_instance_id]
    );
    
    if (agent.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const credentials = agent.rows[0].whatsapp_credentials;
    const results = [];
    const errors = [];
    
    // Send messages with rate limiting
    for (const msg of messages) {
      try {
        const response = await axios.post(
          `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
          {
            messaging_product: 'whatsapp',
            to: msg.to,
            type: 'text',
            text: { body: msg.message }
          },
          {
            headers: {
              'Authorization': `Bearer ${credentials.access_token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        results.push({ to: msg.to, success: true, message_id: response.data.messages[0].id });
        
        // Rate limit: 1 message per second
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        errors.push({ to: msg.to, error: error.message });
      }
    }
    
    logRequest('POST', '/api/whatsapp/send-bulk', 200);
    res.json({ 
      success: true, 
      sent: results.length,
      failed: errors.length,
      results,
      errors 
    });
    
  } catch (error) {
    logRequest('POST', '/api/whatsapp/send-bulk', 500);
    handleError(res, error);
  }
});






// ==================== TWILIO OAUTH SETUP ====================

/**
 * Start Twilio OAuth Flow
 */
app.get('/api/twilio/oauth/start', async (req, res) => {
  try {
    const { company_id, agent_instance_id } = req.query;
    
    if (!company_id || !agent_instance_id) {
      return res.status(400).json({ error: 'company_id and agent_instance_id required' });
    }
    
    // Generate secure state token
    const stateToken = `twilio_${company_id}_${agent_instance_id}_${Date.now()}_${Math.random().toString(36)}`;
    
    // Store state in session/redis (simplified: use in-memory for demo)
    global.twilioOAuthStates = global.twilioOAuthStates || new Map();
    global.twilioOAuthStates.set(stateToken, { company_id, agent_instance_id, expires: Date.now() + 600000 });
    
    // Twilio OAuth URL
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
});

/**
 * Twilio OAuth Callback
 */
app.get('/api/twilio/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.status(400).send('Missing authorization code or state');
    }
    
    // Verify state token
    const stateData = global.twilioOAuthStates?.get(state);
    if (!stateData || stateData.expires < Date.now()) {
      return res.status(403).send('Invalid or expired state token');
    }
    
    // Exchange code for access token
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
    
    // Fetch available phone numbers
    const twilioClient = require('twilio')(account_sid, auth_token);
    const phoneNumbers = await twilioClient.incomingPhoneNumbers.list({ limit: 10 });
    
    if (phoneNumbers.length === 0) {
      return res.status(400).send('No phone numbers found in your Twilio account');
    }
    
    // Use first phone number
    const phoneNumber = phoneNumbers[0].phoneNumber;
    const phoneNumberSid = phoneNumbers[0].sid;
    
    // Generate webhook verify token
    const verifyToken = `twilio_verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Save to database
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
    
    // Cleanup state
    global.twilioOAuthStates.delete(state);
    
    // Success page
    res.send(`
      <html>
        <head><title>Twilio Connected</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>✅ Twilio Account Connected!</h1>
          <p><strong>Phone Number:</strong> ${phoneNumber}</p>
          <p><strong>Webhook URL:</strong><br><code>${process.env.BASE_URL}/twilio/voice-webhook</code></p>
          <p><strong>Verify Token:</strong><br><code>${verifyToken}</code></p>
          <hr>
          <h3>📋 Next Steps:</h3>
          <ol style="text-align: left; max-width: 600px; margin: 20px auto;">
            <li>Go to <a href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming" target="_blank">Twilio Console → Phone Numbers</a></li>
            <li>Click on <strong>${phoneNumber}</strong></li>
            <li>Under <strong>Voice & Fax</strong> → Configure with:
              <ul>
                <li><strong>A Call Comes In:</strong> Webhook</li>
                <li><strong>URL:</strong> <code>${process.env.BASE_URL}/twilio/voice-webhook</code></li>
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
});

/**
 * Check Twilio Connection Status
 */
app.get('/api/twilio/oauth/status/:agent_instance_id', async (req, res) => {
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
});

/**
 * Disconnect Twilio Account
 */
app.delete('/api/twilio/oauth/disconnect/:agent_instance_id', async (req, res) => {
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
});

// ==================== TWILIO VOICE WEBHOOK ====================

/**
 * Universal Twilio Voice Webhook
 * Handles ALL inbound calls for ALL agent instances
 */
app.post('/twilio/voice-webhook', async (req, res) => {
  try {
    const { To, From, CallSid } = req.body;
    
    console.log(`📞 Inbound call: ${From} → ${To} (SID: ${CallSid})`);
    
    // Find which agent instance owns this phone number
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
    
    if (agentResult.rows.length === 0) {
      console.log('⚠️ Unknown phone number:', To);
      
      const VoiceResponse = require('twilio').twiml.VoiceResponse;
      const response = new VoiceResponse();
      response.say('Sorry, this number is not configured. Please contact support.');
      
      return res.type('text/xml').send(response.toString());
    }
    
    const agentInstance = agentResult.rows[0];
    const credentials = agentInstance.twilio_credentials;
    
    // Forward to FastAPI for AI handling
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
    
    // Return TwiML to connect call
    const VoiceResponse = require('twilio').twiml.VoiceResponse;
    const response = new VoiceResponse();
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
});





// ==================== AIRTEL SIP SETUP ====================

/**
 * Configure Airtel SIP Credentials (Manual Setup)
 */
app.post('/api/airtel-sip/configure', async (req, res) => {
  try {
    const { 
      agent_instance_id, 
      sip_domain, 
      sip_username, 
      sip_password, 
      did_number 
    } = req.body;
    
    if (!agent_instance_id || !sip_domain || !sip_username || !sip_password || !did_number) {
      return res.status(400).json({ 
        error: 'agent_instance_id, sip_domain, sip_username, sip_password, and did_number required' 
      });
    }
    
    // Validate DID format
    const normalizedDID = did_number.startsWith('+') ? did_number : `+${did_number}`;
    
    await pool.query(`
      UPDATE agent_instances
      SET 
        phone_number = $1,
        sip_provider = 'airtel',
        sip_credentials = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [
      normalizedDID,
      JSON.stringify({
        sip_domain,
        sip_username,
        sip_password,
        did_number: normalizedDID,
        provider: 'airtel'
      }),
      agent_instance_id
    ]);
    
    res.json({ 
      success: true, 
      message: 'Airtel SIP configured successfully',
      phone_number: normalizedDID 
    });
    
  } catch (error) {
    console.error('Airtel SIP config error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get SIP Configuration Status
 */
app.get('/api/sip/status/:agent_instance_id', async (req, res) => {
  try {
    const { agent_instance_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        phone_number,
        sip_provider,
        sip_credentials,
        twilio_credentials
      FROM agent_instances
      WHERE id = $1
    `, [agent_instance_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const agent = result.rows[0];
    let status = {
      is_configured: false,
      provider: 'none',
      phone_number: null
    };
    
    if (agent.sip_credentials && Object.keys(agent.sip_credentials).length > 0) {
      status = {
        is_configured: true,
        provider: agent.sip_provider || 'custom',
        phone_number: agent.phone_number
      };
    } else if (agent.twilio_credentials && Object.keys(agent.twilio_credentials).length > 0) {
      status = {
        is_configured: true,
        provider: 'twilio',
        phone_number: agent.phone_number
      };
    }
    
    res.json({ success: true, data: status });
    
  } catch (error) {
    console.error('SIP status error:', error);
    res.status(500).json({ error: error.message });
  }
});




// ============================================
// GET LEAD CUSTOM DATA
// ============================================

app.get('/api/leads/:lead_id/custom-fields', async (req, res) => {
  try {
    const { lead_id } = req.params;
    
    const query = `
      SELECT 
        lcd.field_key,
        lcd.field_value,
        cfd.field_label,
        cfd.field_type,
        cfd.field_category
      FROM lead_custom_data lcd
      JOIN custom_field_definitions cfd ON lcd.field_definition_id = cfd.id
      WHERE lcd.lead_id = $1
      ORDER BY cfd.display_order, cfd.field_label
    `;
    
    const result = await pool.query(query, [lead_id]);
    
    // Format as key-value object
    const customFields = {};
    result.rows.forEach(row => {
      customFields[row.field_key] = {
        value: row.field_value,
        label: row.field_label,
        type: row.field_type,
        category: row.field_category
      };
    });
    
    logRequest('GET', `/api/leads/${lead_id}/custom-fields`, 200);
    res.json({ success: true, data: customFields });
    
  } catch (error) {
    logRequest('GET', `/api/leads/${lead_id}/custom-fields`, 500);
    handleError(res, error);
  }
});

// ============================================
// UPDATE LEAD STATUS
// ============================================

app.patch('/api/leads/:lead_id/status', async (req, res) => {
  try {
    const { lead_id } = req.params;
    const { lead_status, interest_level, notes } = req.body;
    
    const updates = [];
    const params = [];
    let paramCount = 0;
    
    if (lead_status) {
      paramCount++;
      updates.push(`lead_status = $${paramCount}`);
      params.push(lead_status);
    }
    
    if (interest_level !== undefined) {
      paramCount++;
      updates.push(`interest_level = $${paramCount}`);
      params.push(interest_level);
    }
    
    if (notes) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      params.push(notes);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(lead_id);
    
    const query = `
      UPDATE leads
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    logRequest('PATCH', `/api/leads/${lead_id}/status`, 200);
    res.json({ success: true, data: result.rows[0] });
    
  } catch (error) {
    logRequest('PATCH', `/api/leads/${lead_id}/status`, 500);
    handleError(res, error);
  }
});

// ============================================
// SEND MANUAL WHATSAPP MESSAGE
// ============================================

app.post('/api/whatsapp/send-manual', async (req, res) => {
  try {
    const { agent_instance_id, to, message, lead_id } = req.body;
    
    if (!agent_instance_id || !to || !message) {
      return res.status(400).json({ 
        error: 'agent_instance_id, to, and message required' 
      });
    }
    
    // Get agent credentials
    const agent = await pool.query(
      'SELECT whatsapp_credentials FROM agent_instances WHERE id = $1',
      [agent_instance_id]
    );
    
    if (agent.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const credentials = agent.rows[0].whatsapp_credentials;
    
    // Send via Meta API
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
    
    // Log in database
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
});

// ============================================
// GET CONVERSATION WITH MESSAGES
// ============================================

app.get('/api/conversations/:phone/messages', async (req, res) => {
  try {
    const { phone } = req.params;
    const { limit } = req.query;
    
    const query = `
      SELECT 
        wm.*,
        l.name as lead_name
      FROM whatsapp_messages wm
      LEFT JOIN leads l ON wm.lead_id = l.id
      WHERE wm.phone_number = $1
      ORDER BY wm.timestamp DESC
      LIMIT $2
    `;
    
    const result = await pool.query(query, [phone, parseInt(limit) || 100]);
    
    logRequest('GET', `/api/conversations/${phone}/messages`, 200);
    res.json({ success: true, data: result.rows });
    
  } catch (error) {
    logRequest('GET', `/api/conversations/${phone}/messages`, 500);
    handleError(res, error);
  }
});

// ============================================
// GET AGENT PERFORMANCE STATS
// ============================================

app.get('/api/agent-instances/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get call stats
    const callStats = await pool.query(`
      SELECT 
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE call_status = 'completed') as completed_calls,
        AVG(call_duration) as avg_duration
      FROM call_logs
      WHERE company_id = (SELECT company_id FROM agent_instances WHERE id = $1)
      AND created_at >= NOW() - INTERVAL '30 days'
    `, [id]);
    
    // Get message stats
    const messageStats = await pool.query(`
      SELECT COUNT(*) as total_messages
      FROM whatsapp_messages
      WHERE lead_id IN (
        SELECT id FROM leads 
        WHERE company_id = (SELECT company_id FROM agent_instances WHERE id = $1)
      )
      AND timestamp >= NOW() - INTERVAL '30 days'
    `, [id]);
    
    logRequest('GET', `/api/agent-instances/${id}/stats`, 200);
    res.json({ 
      success: true, 
      data: {
        ...callStats.rows[0],
        ...messageStats.rows[0]
      }
    });
    
  } catch (error) {
    logRequest('GET', `/api/agent-instances/${id}/stats`, 500);
    handleError(res, error);
  }
});

// ============================================
// EXPORT LEADS TO CSV
// ============================================

app.get('/api/leads/export/csv', async (req, res) => {
  try {
    const { company_id } = req.query;
    
    const query = `
      SELECT 
        l.*,
        COUNT(cl.id) as total_calls,
        COUNT(wm.id) as total_messages
      FROM leads l
      LEFT JOIN call_logs cl ON l.id = cl.lead_id
      LEFT JOIN whatsapp_messages wm ON l.id = wm.lead_id
      WHERE l.company_id = $1
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `;
    
    const result = await pool.query(query, [company_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No leads to export' });
    }
    
    // Convert to CSV
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
    res.setHeader('Content-Disposition', `attachment; filename="leads_${Date.now()}.csv"`);
    res.send(csv);
    
    logRequest('GET', '/api/leads/export/csv', 200);
    
  } catch (error) {
    logRequest('GET', '/api/leads/export/csv', 500);
    handleError(res, error);
  }
});





app.post('/api/webhook/lead-capture', async (req, res) => {
  const apiKey = req.header('X-API-Key');
  if (apiKey !== process.env.LEAD_WEBHOOK_KEY) {
    logRequest('POST', '/api/webhook/lead-capture', 401);
    return res.status(401).json({ success: false, error: 'Invalid API key' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const input = req.body;

    // ---- Validate ----
    if (!input.phone && !input.phone_number) {
      throw new Error('Phone number is required');
    }

    // ---- Normalize phone ----
    let phone = (input.phone || input.phone_number).replace(/\D/g, '');
    if (phone.length === 10) phone = `+91${phone}`;
    else if (!phone.startsWith('+')) phone = `+${phone}`;

    // ---- Source & Tags ----
    const source = input.source || input.lead_source || 'unknown';
    const newTags = [source];
    if (input.campaign) newTags.push(input.campaign.toLowerCase().replace(/\s+/g, '_'));
    if (input.utm_campaign) newTags.push(input.utm_campaign);

    // ---- Custom Fields ----
    const cf = input.form_fields || {};
    const customFields = {
      chess_rating: cf.chess_rating || cf.rating || null,
      location: cf.location || cf.area || null,
      coaching_experience: cf.coaching_experience || null,
      availability: cf.availability || null,
      age_group_pref: cf.age_group_pref || null
    };

    // ---- Metadata ----
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

    if (!input.company_id) {
      throw new Error('company_id is required');
    }

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

    // ---- Check existing lead ----
    const { rows: [existing] } = await client.query(
      `SELECT id, tags, metadata FROM leads WHERE phone_number = $1 LIMIT 1`,
      [phone]
    );

    let lead;
    if (existing) {
      // ---- Merge tags (dedupe) ----
      const existingTags = existing.tags || [];
      const mergedTags = Array.from(new Set([...existingTags, ...payload.tags]));

      // ---- Update lead + custom fields ----
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
          payload.name, payload.email,
          mergedTags, JSON.stringify(payload.metadata),
          customFields.chess_rating, customFields.location,
          customFields.coaching_experience, customFields.availability,
          customFields.age_group_pref,
          phone
        ]
      );
      lead = rows[0];
    } else {
      // ---- Insert new lead ----
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
          payload.company_id, phone, payload.name, payload.email, payload.lead_source,
          JSON.stringify(payload.tags), JSON.stringify(payload.metadata),
          customFields.chess_rating, customFields.location,
          customFields.coaching_experience, customFields.availability,
          customFields.age_group_pref
        ]
      );
      lead = rows[0];
    }

    // ---- Conversation (upsert) ----
    await client.query(
      `INSERT INTO conversations (lead_id, phone_number, conversation_history, message_count)
       VALUES ($1, $2, '', 0)
       ON CONFLICT (lead_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [lead.id, phone]
    );

    // ---- Welcome Notification ----
    const firstName = (lead.name || "there").trim().split(" ")[0];
    const welcomeMsg = `Hi ${firstName}! Thanks for your interest in chess coaching. We'll contact you within 24 hours.`;
    await client.query(
      `INSERT INTO notifications (
        lead_id, phone_number, notification_type, title, message,
        delivery_channel, scheduled_time, status
      ) VALUES ($1, $2, 'welcome', 'Welcome to 4champz!', $3, 'whatsapp', CURRENT_TIMESTAMP, 'pending')`,
      [lead.id, phone, welcomeMsg]
    );

    // ---- Schedule Call (2h from now) ----
    await client.query(
      `INSERT INTO scheduled_calls (company_id, lead_id, call_type, scheduled_time, status)
       VALUES ($1, $2, 'qualification', $3, 'pending')`,
      [lead.company_id, lead.id, new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()]
    );

    // ---- Analytics Event ----
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
});



app.get('/api/lead/:phone', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM leads WHERE phone_number = $1`, [req.params.phone]);
    if (!rows.length) {
      logRequest('GET', `/api/lead/${req.params.phone}`, 404);
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    logRequest('GET', `/api/lead/${req.params.phone}`, 200);
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    logRequest('GET', `/api/lead/${req.params.phone}`, 500);
    handleError(res, e);
  }
});



app.patch('/api/lead/:phone', async (req, res) => {
  const { tags, metadata, ...updates } = req.body;
  try {
    const { rows: [lead] } = await pool.query(
      `SELECT tags FROM leads WHERE phone_number = $1`, [req.params.phone]
    );
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    const mergedTags = Array.from(new Set([...(lead.tags || []), ...(tags || [])]));

    const setClauses = [];
    const values = [];
    let idx = 1;

    if (updates.name) { setClauses.push(`name = $${idx++}`); values.push(updates.name); }
    if (updates.email) { setClauses.push(`email = $${idx++}`); values.push(updates.email); }
    if (tags) { setClauses.push(`tags = $${idx++}`); values.push(mergedTags); }
    if (metadata) { setClauses.push(`metadata = metadata || $${idx++}`); values.push(JSON.stringify(metadata)); }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.phone);

    const query = `
      UPDATE leads SET ${setClauses.join(', ')}
      WHERE phone_number = $${idx}
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);
    logRequest('PATCH', `/api/lead/${req.params.phone}`, 200);
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    logRequest('PATCH', `/api/lead/${req.params.phone}`, 500);
    handleError(res, e);
  }
});



app.get('/api/notifications/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT n.*, l.phone_number AS lead_phone
      FROM notifications n
      JOIN leads l ON n.lead_id = l.id
      WHERE n.status = 'pending' 
        AND n.scheduled_time <= NOW()
      ORDER BY n.scheduled_time ASC
      LIMIT 50
    `);
    logRequest('GET', '/api/notifications/pending', 200);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (e) {
    logRequest('GET', '/api/notifications/pending', 500);
    handleError(res, e);
  }
});




app.get('/api/scheduled-calls/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT sc.*, l.phone_number, l.name, l.company_id
      FROM scheduled_calls sc
      JOIN leads l ON sc.lead_id = l.id
      WHERE sc.status = 'pending' 
        AND sc.scheduled_time <= NOW()
      ORDER BY sc.scheduled_time ASC
    `);
    logRequest('GET', '/api/scheduled-calls/pending', 200);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (e) {
    logRequest('GET', '/api/scheduled-calls/pending', 500);
    handleError(res, e);
  }
});




app.post('/api/analytics/event', async (req, res) => {
  const { event_name, lead_id, company_id, event_properties } = req.body;
  if (!event_name) {
    return res.status(400).json({ success: false, error: 'event_name is required' });
  }
  try {
    await pool.query(
      `INSERT INTO analytics_events (event_name, lead_id, company_id, event_properties, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [
        event_name,
        lead_id || null,
        company_id || null,
        event_properties ? JSON.stringify(event_properties).slice(0, 4000) : null
      ]
    );
    logRequest('POST', '/api/analytics/event', 201);
    res.status(201).json({ success: true });
  } catch (e) {
    logRequest('POST', '/api/analytics/event', 500);
    handleError(res, e);
  }
});


// Add this helper function BEFORE your webhook endpoint
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
    
    // If token expires in less than 7 days, refresh it
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
      
      // For Meta and LinkedIn, tokens are long-lived (60 days)
      // They don't support programmatic refresh, user needs to re-authorize
      if (platform === 'meta' || platform === 'linkedin') {
        console.warn(`⚠️ ${platform} token expiring soon. User needs to re-authorize.`);
      }
    }
    
    return creds.access_token;
  } catch (error) {
    console.error(`❌ Token check/refresh failed for ${platform}:`, error.message);
    // Return null to indicate failure, but don't break the webhook
    return null;
  }
}



// ============================================
// OAUTH & LEAD INTEGRATION ENDPOINTS
// ============================================

// 1. START OAUTH FLOW (Meta/Facebook)
app.get('/api/oauth/meta/start', async (req, res) => {
  try {
    const { company_id } = req.query;
    
    if (!company_id) {
      return res.status(400).json({ error: 'company_id required' });
    }
    
    // Store state for verification
    const state = Buffer.from(JSON.stringify({
      company_id,
      platform: 'meta',
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substr(2, 9)
    })).toString('base64');
    
    const redirectUri = `${process.env.BASE_URL}/api/oauth/meta/callback`;
    
    const authUrl = 
      `https://www.facebook.com/v21.0/dialog/oauth?` +
      `client_id=${process.env.META_APP_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${encodeURIComponent(state)}&` +
      // `scope=ads_read,leads_retrieval,business_management`;
      `scope=ads_read,leads_retrieval,business_management,pages_show_list,pages_read_engagement,ads_management&` +
      `response_type=code`;
    
    res.json({ success: true, auth_url: authUrl });
  } catch (error) {
    console.error('Meta OAuth start error:', error);
    res.status(500).json({ error: error.message });
  }
});




// 2. OAUTH CALLBACK (Meta/Facebook)
app.get('/api/oauth/meta/callback', async (req, res) => {
  try {
    const { code, state, error: oauth_error } = req.query;
    
    if (oauth_error) {
      return res.status(400).send(`OAuth Error: ${oauth_error}`);
    }
    
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { company_id } = stateData;
    
    const redirectUri = `${process.env.BASE_URL}/api/oauth/meta/callback`;
    
    // Exchange code for token
    const tokenResponse = await axios.post(
      'https://graph.facebook.com/v21.0/oauth/access_token',
      null,
      {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          code: code,
          redirect_uri: redirectUri
        }
      }
    );
    
    // const accessToken = tokenResponse.data.access_token;
    const { access_token, expires_in } = tokenResponse.data;
    
    // Get Ad Accounts
    const accountsResponse = await axios.get(
      'https://graph.facebook.com/v21.0/me/adaccounts',
      {
        params: {
          access_token: accessToken,
          fields: 'id,name,account_status,currency,timezone_name'
        }
      }
    );
    
    const accounts = accountsResponse.data.data;
    
    if (accounts.length === 0) {
      return res.status(400).send('No ad accounts found');
    }
    
    const primaryAccount = accounts[0];

    // Get lead gen forms for this account
    const formsResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${primaryAccount.id}/leadgen_forms`,
      {
        params: {
          access_token: access_token,
          fields: 'id,name,status,leads_count,page_id,questions'
        }
      }
    );
    
    const forms = formsResponse.data.data || [];
    
    
    // Store credentials
    await pool.query(`
      INSERT INTO oauth_credentials (
        company_id, platform, access_token, account_id, 
        account_name, token_expires_at, scopes
      )
      VALUES ($1, 'meta', $2, $3, $4, NOW() + $5 * INTERVAL '1 second', $6)
      ON CONFLICT (company_id, platform) DO UPDATE
      SET 
        access_token = EXCLUDED.access_token,
        account_id = EXCLUDED.account_id,
        account_name = EXCLUDED.account_name,
        token_expires_at = EXCLUDED.token_expires_at,
        scopes = EXCLUDED.scopes,
        updated_at = CURRENT_TIMESTAMP
    `, [company_id, accessToken, primaryAccount.id, primaryAccount.name, expires_in, ['ads_read', 'leads_retrieval', 'business_management']]);
    
    // // Get Lead Forms
    // const formsResponse = await axios.get(
    //   `https://graph.facebook.com/v21.0/${primaryAccount.id}/leadgen_forms`,
    //   {
    //     params: {
    //       access_token: accessToken,
    //       fields: 'id,name,status,leads_count'
    //     }
    //   }
    // );
    
    // const forms = formsResponse.data.data;


    // Auto-configure webhooks for forms
    for (const form of forms) {
      await configureMetaFormWebhook(company_id, form.id, form.name, access_token);
    }
    
    logRequest('GET', '/api/oauth/meta/callback', 200);
    res.send(generateSuccessPage('Meta Ads', {
      account: primaryAccount.name,
      forms: forms.length,
      forms_list: forms
    }));
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Meta Ads Connected</title>
        <style>
          body { font-family: Arial; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 800px; margin: 0 auto; }
          .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
          .form-list { margin: 20px 0; }
          .form-item { padding: 15px; background: #f8f9fa; margin: 10px 0; border-radius: 5px; }
          .btn { background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅ Meta Ads Connected Successfully!</div>
          <p><strong>Account:</strong> ${primaryAccount.name}</p>
          <p><strong>Account ID:</strong> ${primaryAccount.id}</p>
          
          <h3>Lead Forms Found (${forms.length}):</h3>
          <div class="form-list">
            ${forms.map(form => `
              <div class="form-item">
                <strong>${form.name}</strong><br>
                Form ID: ${form.id} | Leads: ${form.leads_count || 0}
              </div>
            `).join('')}
          </div>
          
          <p style="margin-top: 30px;">
            <strong>Next Step:</strong> Configure webhooks in your CRM dashboard to start receiving leads.
          </p>
          
          <a href="/dashboard?tab=integrations" class="btn">Go to Dashboard</a>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Meta OAuth callback error:', error);
    res.status(500).send(`Error: ${error.message}`);
    logRequest('GET', '/api/oauth/meta/callback', 500);
    res.status(500).send(generateErrorPage('Connection Failed', error.message));
  }
});



/**
 * Auto-configure webhook for Meta form
 */
async function configureMetaFormWebhook(company_id, form_id, form_name, access_token) {
  try {
    const webhookToken = `meta_${company_id}_${form_id}_${Date.now()}`;
    const webhookUrl = `${process.env.BASE_URL}/api/webhooks/meta-leads/${webhookToken}`;
    
    // Subscribe to lead updates
    await axios.post(
      `https://graph.facebook.com/v21.0/${form_id}/subscribed_apps`,
      null,
      {
        params: { access_token: access_token }
      }
    );
    
    // Store form configuration
    await pool.query(`
      INSERT INTO lead_source_configs (
        company_id, platform, form_id, form_name, 
        field_mappings, webhook_url, is_active
      )
      VALUES ($1, 'meta', $2, $3, $4, $5, TRUE)
      ON CONFLICT (company_id, platform, form_id) DO UPDATE
      SET 
        form_name = EXCLUDED.form_name,
        webhook_url = EXCLUDED.webhook_url,
        updated_at = CURRENT_TIMESTAMP
    `, [
      company_id,
      form_id,
      form_name,
      JSON.stringify({
        full_name: 'name',
        email: 'email',
        phone_number: 'phone_number',
        custom_question: 'notes'
      }),
      webhookUrl
    ]);
    
    console.log(`✅ Meta form ${form_id} webhook configured`);
    return true;
    
  } catch (error) {
    console.error(`Failed to configure webhook for form ${form_id}:`, error);
    return false;
  }
}

/**
 * Meta Webhook for lead capture
 */
app.post('/api/webhooks/meta-leads/:token', async (req, res) => {
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
    
    // Find configuration
    const configResult = await pool.query(
      `SELECT * FROM lead_source_configs WHERE webhook_url LIKE $1 AND is_active = TRUE`,
      [`%${token}%`]
    );
    
    if (configResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid webhook token' });
    }
    
    const config = configResult.rows[0];
    const { company_id, form_id, field_mappings } = config;
    
    // Process Meta lead data
    const entry = rawData.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    
    if (!value || !value.leadgen_id) {
      return res.json({ success: true, message: 'No lead data' });
    }
    
    // Get OAuth credentials
    const credResult = await pool.query(
      'SELECT access_token FROM oauth_credentials WHERE company_id = $1 AND platform = $2',
      [company_id, 'meta']
    );
    
    if (credResult.rows.length === 0) {
      throw new Error('Meta OAuth credentials not found');
    }
    
    const access_token = credResult.rows[0].access_token;
    
    // Fetch full lead data from Meta
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
    
    // Map fields
    const mappedData = {};
    fieldData.forEach(field => {
      const crmField = field_mappings[field.name] || field.name;
      mappedData[crmField] = field.values?.[0] || '';
    });
    
    // Ensure required fields
    if (!mappedData.phone_number && !mappedData.email) {
      throw new Error('No contact information in Meta lead');
    }
    
    // Normalize phone
    let phone = mappedData.phone_number;
    if (phone) {
      phone = phone.replace(/\D/g, '');
      if (phone.length === 10) phone = '+91' + phone;
      else if (!phone.startsWith('+')) phone = '+' + phone;
    }
    
    // Create/update lead
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
    
    // Log import
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
    
    // Log error
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
});

/**
 * Get Meta forms for configuration
 */
app.get('/api/oauth/meta/forms/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const credResult = await pool.query(
      'SELECT access_token, account_id FROM oauth_credentials WHERE company_id = $1 AND platform = $2',
      [company_id, 'meta']
    );
    
    if (credResult.rows.length === 0) {
      return res.status(404).json({ error: 'Meta not connected' });
    }
    
    const { access_token, account_id } = credResult.rows[0];
    
    const formsResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${account_id}/leadgen_forms`,
      {
        params: {
          access_token: access_token,
          fields: 'id,name,status,leads_count,questions,page_id'
        }
      }
    );
    
    logRequest('GET', `/api/oauth/meta/forms/${company_id}`, 200);
    res.json({ 
      success: true, 
      forms: formsResponse.data.data || [] 
    });
    
  } catch (error) {
    console.error('Get Meta forms error:', error);
    logRequest('GET', `/api/oauth/meta/forms/${company_id}`, 500);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sync Meta leads manually
 */
app.post('/api/oauth/meta/sync-leads', async (req, res) => {
  try {
    const { company_id, form_id, limit = 50 } = req.body;
    
    if (!company_id || !form_id) {
      return res.status(400).json({ error: 'company_id and form_id required' });
    }
    
    const credResult = await pool.query(
      'SELECT access_token FROM oauth_credentials WHERE company_id = $1 AND platform = $2',
      [company_id, 'meta']
    );
    
    if (credResult.rows.length === 0) {
      return res.status(404).json({ error: 'Meta not connected' });
    }
    
    const access_token = credResult.rows[0].access_token;
    
    // Fetch leads from Meta
    const leadsResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${form_id}/leads`,
      {
        params: {
          access_token: access_token,
          limit: limit,
          fields: 'id,created_time,field_data'
        }
      }
    );
    
    const leads = leadsResponse.data.data || [];
    const results = [];
    const errors = [];
    
    for (const lead of leads) {
      try {
        // Process each lead through webhook
        await axios.post(`${process.env.BASE_URL}/api/webhooks/meta-leads/sync`, {
          entry: [{
            changes: [{
              value: {
                leadgen_id: lead.id,
                form_id: form_id
              }
            }]
          }]
        });
        
        results.push({ lead_id: lead.id, success: true });
      } catch (error) {
        errors.push({ lead_id: lead.id, error: error.message });
      }
    }
    
    logRequest('POST', '/api/oauth/meta/sync-leads', 200);
    res.json({
      success: true,
      synced: results.length,
      failed: errors.length,
      results,
      errors
    });
    
  } catch (error) {
    console.error('Sync Meta leads error:', error);
    logRequest('POST', '/api/oauth/meta/sync-leads', 500);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions for HTML pages
function generateSuccessPage(platform, data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>${platform} Connected</title>
  <style>
    body { font-family: Arial; padding: 50px; background: #f5f5f5; }
    .container { background: white; padding: 40px; border-radius: 10px; max-width: 800px; margin: 0 auto; }
    .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
    .info { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .btn { background: #007bff; color: white; padding: 12px 24px; border-radius: 5px; text-decoration: none; display: inline-block; margin: 10px 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="success">✅ ${platform} Connected Successfully!</div>
    <div class="info">
      <p><strong>Account:</strong> ${data.account}</p>
      <p><strong>Lead Forms Found:</strong> ${data.forms}</p>
      ${data.forms_list ? `
        <ul>
          ${data.forms_list.map(form => `<li>${form.name} (${form.leads_count} leads)</li>`).join('')}
        </ul>
      ` : ''}
    </div>
    <p>Webhooks have been auto-configured. Leads will now sync automatically.</p>
    <a href="/dashboard?tab=integrations" class="btn">Go to Dashboard</a>
  </div>
</body>
</html>
  `;
}

function generateErrorPage(title, message) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Error - ${title}</title>
  <style>
    body { font-family: Arial; padding: 50px; background: #f5f5f5; text-align: center; }
    .container { background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto; }
    .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
    .btn { background: #6c757d; color: white; padding: 12px 24px; border-radius: 5px; text-decoration: none; display: inline-block; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="error">❌ ${title}</div>
    <p>${message}</p>
    <a href="/dashboard?tab=integrations" class="btn">← Back to Dashboard</a>
  </div>
</body>
</html>
  `;
}




// 3. START OAUTH FLOW (Google Ads)
app.get('/api/oauth/google-ads/start', async (req, res) => {
  try {
    const { company_id } = req.query;
    
    if (!company_id) {
      return res.status(400).json({ error: 'company_id required' });
    }
    
    const state = Buffer.from(JSON.stringify({
      company_id,
      platform: 'google_ads',
      timestamp: Date.now()
    })).toString('base64');
    
    const redirectUri = `${process.env.BASE_URL}/api/oauth/google-ads/callback`;
    
    const authUrl = 
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=https://www.googleapis.com/auth/adwords&` +
      `access_type=offline&` +
      `state=${encodeURIComponent(state)}&` +
      `prompt=consent`;
    
    res.json({ success: true, auth_url: authUrl });
  } catch (error) {
    console.error('Google Ads OAuth start error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. OAUTH CALLBACK (Google Ads)
app.get('/api/oauth/google-ads/callback', async (req, res) => {
  try {
    const { code, state, error: oauth_error } = req.query;
    
    if (oauth_error) {
      return res.status(400).send(`OAuth Error: ${oauth_error}`);
    }
    
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { company_id } = stateData;
    
    const redirectUri = `${process.env.BASE_URL}/api/oauth/google-ads/callback`;
    
    // Exchange code for token
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        code: code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }
    );
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // Get Google Ads accounts
    const accountsResponse = await axios.get(
      'https://googleads.googleapis.com/v14/customers:listAccessibleCustomers',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN
        }
      }
    );
    
    const customerIds = accountsResponse.data.resourceNames.map(name => name.split('/')[1]);
    const primaryCustomer = customerIds[0];
    
    // Store credentials
    await pool.query(`
      INSERT INTO oauth_credentials (
        company_id, platform, access_token, refresh_token,
        account_id, token_expires_at, scopes
      )
      VALUES ($1, 'google_ads', $2, $3, $4, NOW() + INTERVAL '${expires_in} seconds', $5)
      ON CONFLICT (company_id, platform) DO UPDATE
      SET 
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        account_id = EXCLUDED.account_id,
        token_expires_at = EXCLUDED.token_expires_at,
        updated_at = CURRENT_TIMESTAMP
    `, [company_id, access_token, refresh_token, primaryCustomer, ['adwords']]);
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Ads Connected</title>
        <style>
          body { font-family: Arial; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 800px; margin: 0 auto; }
          .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
          .btn { background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅ Google Ads Connected Successfully!</div>
          <p><strong>Customer ID:</strong> ${primaryCustomer}</p>
          <p><strong>Accounts Found:</strong> ${customerIds.length}</p>
          
          <p style="margin-top: 30px;">
            <strong>Next Step:</strong> Configure lead form extensions in your CRM dashboard.
          </p>
          
          <a href="/dashboard?tab=integrations" class="btn">Go to Dashboard</a>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Google Ads OAuth callback error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});






// 5. START OAUTH FLOW (LinkedIn)
app.get('/api/oauth/linkedin/start', async (req, res) => {
  try {
    const { company_id } = req.query;
    
    if (!company_id) {
      return res.status(400).json({ error: 'company_id required' });
    }
    
    const state = Buffer.from(JSON.stringify({
      company_id,
      platform: 'linkedin',
      timestamp: Date.now()
    })).toString('base64');
    
    const redirectUri = `${process.env.BASE_URL}/api/oauth/linkedin/callback`;
    
    const authUrl = 
      `https://www.linkedin.com/oauth/v2/authorization?` +
      `response_type=code&` +
      `client_id=${process.env.LINKEDIN_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${encodeURIComponent(state)}&` +
      `scope=r_ads,r_ads_leadgen_automation,r_ads_reporting`;
    
    res.json({ success: true, auth_url: authUrl });
  } catch (error) {
    console.error('LinkedIn OAuth start error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. OAUTH CALLBACK (LinkedIn)
app.get('/api/oauth/linkedin/callback', async (req, res) => {
  try {
    const { code, state, error: oauth_error } = req.query;
    
    if (oauth_error) {
      return res.status(400).send(`OAuth Error: ${oauth_error}`);
    }
    
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { company_id } = stateData;
    
    const redirectUri = `${process.env.BASE_URL}/api/oauth/linkedin/callback`;
    
    // Exchange code for token
    const tokenResponse = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    
    const { access_token, expires_in } = tokenResponse.data;
    
    // Get Ad Accounts
    const accountsResponse = await axios.get(
      'https://api.linkedin.com/v2/adAccountsV2?q=search',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'LinkedIn-Version': '202401'
        }
      }
    );
    
    const accounts = accountsResponse.data.elements;
    const primaryAccount = accounts[0];
    
    // Store credentials
    await pool.query(`
      INSERT INTO oauth_credentials (
        company_id, platform, access_token, account_id,
        account_name, token_expires_at, scopes
      )
      VALUES ($1, 'linkedin', $2, $3, $4, NOW() + INTERVAL '${expires_in} seconds', $5)
      ON CONFLICT (company_id, platform) DO UPDATE
      SET 
        access_token = EXCLUDED.access_token,
        account_id = EXCLUDED.account_id,
        account_name = EXCLUDED.account_name,
        token_expires_at = EXCLUDED.token_expires_at,
        updated_at = CURRENT_TIMESTAMP
    `, [company_id, access_token, primaryAccount.id, primaryAccount.name, ['r_ads', 'r_ads_leadgen_automation']]);
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>LinkedIn Ads Connected</title>
        <style>
          body { font-family: Arial; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 800px; margin: 0 auto; }
          .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
          .btn { background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅ LinkedIn Ads Connected Successfully!</div>
          <p><strong>Account:</strong> ${primaryAccount.name}</p>
          <p><strong>Account ID:</strong> ${primaryAccount.id}</p>
          
          <p style="margin-top: 30px;">
            <strong>Next Step:</strong> Configure lead gen forms in your CRM dashboard.
          </p>
          
          <a href="/dashboard?tab=integrations" class="btn">Go to Dashboard</a>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('LinkedIn OAuth callback error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});






// 7. GET LEAD FORMS (Meta)
app.get('/api/lead-sources/meta/forms/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const creds = await pool.query(
      'SELECT access_token, account_id FROM oauth_credentials WHERE company_id = $1 AND platform = $2',
      [company_id, 'meta']
    );
    
    if (creds.rows.length === 0) {
      return res.status(404).json({ error: 'Meta credentials not found' });
    }
    
    const { access_token, account_id } = creds.rows[0];
    
    const formsResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${account_id}/leadgen_forms`,
      {
        params: {
          access_token: access_token,
          fields: 'id,name,status,leads_count,questions'
        }
      }
    );
    
    res.json({ success: true, forms: formsResponse.data.data });
  } catch (error) {
    console.error('Get Meta forms error:', error);
    res.status(500).json({ error: error.message });
  }
});



// 8. CONFIGURE LEAD SOURCE MAPPING
app.post('/api/lead-sources/configure', async (req, res) => {
  try {
    const {
      company_id,
      platform,
      form_id,
      form_name,
      field_mappings
    } = req.body;
    
    if (!company_id || !platform || !form_id || !field_mappings) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Generate unique webhook URL
    const webhookToken = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const webhookUrl = `${process.env.BASE_URL}/api/webhooks/lead-capture/${webhookToken}`;
    
    const result = await pool.query(`
      INSERT INTO lead_source_configs (
        company_id, platform, form_id, form_name, 
        field_mappings, webhook_url
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (company_id, platform, form_id) DO UPDATE
      SET 
        form_name = EXCLUDED.form_name,
        field_mappings = EXCLUDED.field_mappings,
        webhook_url = EXCLUDED.webhook_url,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [company_id, platform, form_id, form_name, JSON.stringify(field_mappings), webhookUrl]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Configure lead source error:', error);
    res.status(500).json({ error: error.message });
  }
});



// -------------------------------
// 9. UNIFIED WEBHOOK FOR ALL PLATFORMS
// -------------------------------
app.post('/api/webhooks/lead-capture/:token', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { token } = req.params;
    const rawData = req.body;

    console.log('📥 Webhook received:', { token, platform: 'detecting...', rawData });

    // 1. Get lead source config
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

    // ✅ NEW: Check and refresh OAuth token if needed (non-blocking)
    try {
      const refreshedToken = await checkAndRefreshToken(company_id, platform);
      if (refreshedToken) {
        console.log(`🔄 Using refreshed token for ${platform}`);
      } else {
        console.warn(`⚠️ Token refresh failed for ${platform}, proceeding with existing token`);
      }
    } catch (tokenError) {
      // Log but don't fail the webhook - leads should still be captured
      console.warn(`⚠️ Token check error for ${platform}:`, tokenError.message);
    }

    // 2. Parse platform-specific data
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
      // ✅ FIX: Map all fields from rawData
      Object.keys(rawData).forEach(key => {
        const crmField = field_mappings[key];
        if (crmField) {
          leadData[crmField] = rawData[key];
          console.log(`📌 Mapped: ${key} → ${crmField} = ${rawData[key]}`);
        }
      });
      // ✅ FIX: Also check direct fields if mapping fails
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

      // ✅ FIX: Also check direct fields if mapping fails
      if (!leadData.phone_number && !leadData.phone) {
        rawData.answers?.forEach(answer => {
          if (answer.questionId.toLowerCase().includes('phone')) {
            leadData.phone_number = answer.answerDetails?.textQuestionAnswer || answer.answerDetails?.value;
          }
        });
      }
    }

    console.log('📊 Mapped lead data:', leadData);


    // 3. Normalize phone
    let phone = leadData.phone_number || leadData.phone;
    if (!phone) {
      console.error('❌ Phone number missing in mapped data:', leadData);
      throw new Error('Phone number is required. Please check field mappings.');
    }

    phone = phone.replace(/\D/g, '');
    if (phone.length === 10) phone = `+91${phone}`;
    else if (!phone.startsWith('+')) phone = `+${phone}`;

    console.log('📞 Normalized phone:', phone);

    // 4. Check if lead exists
    const existingLead = await client.query(
      'SELECT id, tags FROM leads WHERE phone_number = $1',
      [phone]
    );

    let leadId;

    if (existingLead.rows.length > 0) {
      // ------------------------------
      // ✅ Update existing lead
      // ------------------------------
      console.log('🔄 Updating existing lead:', existingLead.rows[0].id);
      const lead = existingLead.rows[0];
      const newTags = Array.from(
        new Set([...(lead.tags || []), platform, config.form_name])
      );

      const updateResult = await client.query(
        `
        UPDATE leads
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
        RETURNING id
        `,
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
        `
        INSERT INTO lead_import_logs (
          company_id, platform, lead_id, form_id,
          raw_data, mapped_data, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'duplicate')
        `,
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
      // ------------------------------
      // ✅ Create new lead
      // ------------------------------
      console.log('➕ Creating new lead');
      const insertResult = await client.query(
        `
        INSERT INTO leads (
          company_id, phone_number, name, email,
          lead_source, lead_status, tags, 
          lead_source_config_id, metadata
        )
        VALUES ($1, $2, $3, $4, $5, 'new', $6, $7, $8)
        RETURNING id
        `,
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

      // Log import
      await client.query(
        `
        INSERT INTO lead_import_logs (
          company_id, platform, lead_id, form_id,
          raw_data, mapped_data, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'success')
        `,
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
          `
          INSERT INTO conversations (lead_id, phone_number, conversation_history)
          VALUES ($1, $2, '')
          `,
          [leadId, phone]
        );
        console.log('✅ Conversation created');
      } catch (convError) {
        // If conversation already exists (shouldn't happen for new lead), log but continue
        if (convError.code === '23505') { // Unique violation
          console.log('ℹ️ Conversation already exists');
        } else {
          throw convError;
        }
      }

      // Welcome notification
      await client.query(
        `
        INSERT INTO notifications (
          lead_id, phone_number, notification_type, title, message,
          delivery_channel, scheduled_time, status
        )
        VALUES ($1, $2, 'welcome', 'Welcome!', $3, 'whatsapp',
        CURRENT_TIMESTAMP, 'pending')
        `,
        [
          leadId,
          phone,
          `Hi ${leadData.name || 'there'}! Thanks for your interest. We'll contact you soon.`
        ]
      );

      console.log('✅ Welcome notification queued');

      // Follow-up call (2 hours later)
      await client.query(
        `
        INSERT INTO scheduled_calls (
          company_id, lead_id, call_type, scheduled_time, status
        )
        VALUES ($1, $2, 'qualification', $3, 'pending')
        `,
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

    // Safe fallback logging
    try {
      await pool.query(
        `
        INSERT INTO lead_import_logs (
          company_id, platform, form_id, raw_data,
          status, error_message
        )
        VALUES ($1, 'unknown', 'unknown', $2, 'failed', $3)
        `,
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
});




// -------------------------------
// 10. GET OAUTH STATUS
// -------------------------------
app.get('/api/oauth/status/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;

    const result = await pool.query(
      `
      SELECT platform, account_id, account_name,
             token_expires_at, is_active,
             EXTRACT(DAY FROM (token_expires_at - NOW())) AS days_until_expiry
      FROM oauth_credentials
      WHERE company_id = $1
      ORDER BY platform
      `,
      [company_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get OAuth status error:', error);
    res.status(500).json({ error: error.message });
  }
});


// -------------------------------
// 11. DISCONNECT PLATFORM
// -------------------------------
app.delete('/api/oauth/:company_id/:platform', async (req, res) => {
  try {
    const { company_id, platform } = req.params;

    await pool.query(
      'DELETE FROM oauth_credentials WHERE company_id = $1 AND platform = $2',
      [company_id, platform]
    );

    await pool.query(
      'UPDATE lead_source_configs SET is_active = FALSE WHERE company_id = $1 AND platform = $2',
      [company_id, platform]
    );

    res.json({ success: true, message: `${platform} disconnected` });
  } catch (error) {
    console.error('Disconnect platform error:', error);
    res.status(500).json({ error: error.message });
  }
});


// -------------------------------
// 12. GET LEAD IMPORT STATS
// -------------------------------
app.get('/api/lead-imports/stats/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    const { start_date, end_date } = req.query;

    let query = `
      SELECT platform, status, COUNT(*) AS count,
             DATE(created_at) AS date
      FROM lead_import_logs
      WHERE company_id = $1
    `;

    const params = [company_id];

    if (start_date) {
      params.push(start_date);
      query += ` AND created_at >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      query += ` AND created_at <= $${params.length}`;
    }

    query += ` GROUP BY platform, status, DATE(created_at)
               ORDER BY date DESC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });

  } catch (error) {
    console.error('Get import stats error:', error);
    res.status(500).json({ error: error.message });
  }
});


// -------------------------------
// 13. RETRY FAILED IMPORT
// -------------------------------
app.post('/api/lead-imports/retry/:log_id', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { log_id } = req.params;

    // Get failed log entry
    const logResult = await client.query(
      'SELECT * FROM lead_import_logs WHERE id = $1 AND status = $2',
      [log_id, 'failed']
    );

    if (logResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Failed import not found' });
    }

    const log = logResult.rows[0];

    // Get source config
    const configResult = await client.query(
      `SELECT * FROM lead_source_configs 
       WHERE company_id = $1 AND platform = $2 AND form_id = $3`,
      [log.company_id, log.platform, log.form_id]
    );

    if (configResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lead source config not found' });
    }

    const config = configResult.rows[0];
    const rawData = log.raw_data;
    const mappedData = log.mapped_data;
    const phone = mappedData.phone_number || mappedData.phone;

    // Insert/update lead
    const insertResult = await client.query(
      `
      INSERT INTO leads (
        company_id, phone_number, name, email, lead_source,
        lead_status, tags, lead_source_config_id, metadata
      )
      VALUES ($1, $2, $3, $4, $5, 'new', $6, $7, $8)
      ON CONFLICT (phone_number) DO UPDATE
      SET name = COALESCE(EXCLUDED.name, leads.name),
          updated_at = CURRENT_TIMESTAMP
      RETURNING id
      `,
      [
        log.company_id,
        phone,
        mappedData.name || 'New Lead',
        mappedData.email,
        log.platform,
        [log.platform, config.form_name],
        config.id,
        JSON.stringify({ [log.platform]: rawData })
      ]
    );

    const leadId = insertResult.rows[0].id;

    // Update log
    await client.query(
      'UPDATE lead_import_logs SET status = $1, lead_id = $2 WHERE id = $3',
      ['success', leadId, log_id]
    );

    await client.query('COMMIT');
    res.json({ success: true, lead_id: leadId });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Retry import error:', error);
    res.status(500).json({ error: error.message });

  } finally {
    client.release();
  }
});


// -------------------------------
// 14. GET LEAD SOURCE CONFIGS
// -------------------------------
app.get('/api/lead-sources/configs/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;

    const result = await pool.query(
      `
      SELECT 
        lsc.*,
        oc.account_name,
        oc.is_active AS platform_connected
      FROM lead_source_configs lsc
      LEFT JOIN oauth_credentials oc
        ON lsc.company_id = oc.company_id
        AND lsc.platform = oc.platform
      WHERE lsc.company_id = $1
      ORDER BY lsc.created_at DESC
      `,
      [company_id]
    );

    res.json({ success: true, data: result.rows });

  } catch (error) {
    console.error('Get lead source configs error:', error);
    res.status(500).json({ error: error.message });
  }
});



// ============================================
// LEAD WORKFLOW ENDPOINTS (For n8n)
// ============================================

// 1. CHECK IF LEAD EXISTS
app.post('/api/workflow/check-lead', async (req, res) => {
  try {
    const { phone_number } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number required' });
    }
    
    const result = await pool.query(
      'SELECT id, tags, metadata FROM leads WHERE phone_number = $1 LIMIT 1',
      [phone_number]
    );
    
    if (result.rows.length === 0) {
      return res.json({ 
        success: true, 
        exists: false,
        lead: null 
      });
    }
    
    res.json({ 
      success: true, 
      exists: true,
      lead: result.rows[0] 
    });
  } catch (error) {
    console.error('Check lead error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. CREATE NEW LEAD
app.post('/api/workflow/create-lead', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      company_id,
      phone_number,
      name,
      email,
      platform,
      form_id,
      tags,
      raw_data,
      mapped_data
    } = req.body;
    
    if (!company_id || !phone_number || !platform) {
      throw new Error('company_id, phone_number, and platform are required');
    }
    
    // Insert lead
    const leadResult = await client.query(`
      INSERT INTO leads (
        company_id, phone_number, name, email, lead_source,
        lead_status, tags, metadata
      )
      VALUES ($1, $2, $3, $4, $5, 'new', $6, $7)
      RETURNING *
    `, [
      company_id,
      phone_number,
      name || 'New Lead',
      email,
      platform,
      tags || [platform],
      JSON.stringify({ [platform]: raw_data })
    ]);
    
    const leadId = leadResult.rows[0].id;
    
    // Create conversation
    await client.query(`
      INSERT INTO conversations (lead_id, phone_number, conversation_history)
      VALUES ($1, $2, '')
      ON CONFLICT (lead_id) DO NOTHING
    `, [leadId, phone_number]);
    
    // Log import
    await client.query(`
      INSERT INTO lead_import_logs (
        company_id, platform, lead_id, form_id,
        raw_data, mapped_data, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'success')
    `, [
      company_id,
      platform,
      leadId,
      form_id,
      JSON.stringify(raw_data),
      JSON.stringify(mapped_data)
    ]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      lead: leadResult.rows[0] 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create lead error:', error);
    
    // Log failed import
    try {
      await pool.query(`
        INSERT INTO lead_import_logs (
          company_id, platform, form_id, raw_data, status, error_message
        )
        VALUES ($1, $2, $3, $4, 'failed', $5)
      `, [
        req.body.company_id || 0,
        req.body.platform || 'unknown',
        req.body.form_id || 'unknown',
        JSON.stringify(req.body.raw_data),
        error.message
      ]);
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// 3. UPDATE EXISTING LEAD
app.post('/api/workflow/update-lead', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      phone_number,
      name,
      email,
      platform,
      form_id,
      tags,
      raw_data,
      mapped_data,
      company_id
    } = req.body;
    
    if (!phone_number || !platform) {
      throw new Error('phone_number and platform are required');
    }
    
    // Get existing lead
    const existingResult = await client.query(
      'SELECT id, tags FROM leads WHERE phone_number = $1',
      [phone_number]
    );
    
    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const existingLead = existingResult.rows[0];
    const mergedTags = Array.from(new Set([
      ...(existingLead.tags || []),
      ...(tags || [platform])
    ]));
    
    // Update lead
    const updateResult = await client.query(`
      UPDATE leads
      SET 
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        lead_source = $3,
        tags = $4,
        metadata = metadata || $5::jsonb,
        last_contacted = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE phone_number = $6
      RETURNING *
    `, [
      name,
      email,
      platform,
      mergedTags,
      JSON.stringify({ [platform]: raw_data }),
      phone_number
    ]);
    
    // Log import as duplicate
    await client.query(`
      INSERT INTO lead_import_logs (
        company_id, platform, lead_id, form_id,
        raw_data, mapped_data, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'duplicate')
    `, [
      company_id,
      platform,
      existingLead.id,
      form_id,
      JSON.stringify(raw_data),
      JSON.stringify(mapped_data)
    ]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      lead: updateResult.rows[0] 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update lead error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// 4. SEND WELCOME NOTIFICATION
app.post('/api/workflow/send-welcome', async (req, res) => {
  try {
    const { lead_id, phone_number, name } = req.body;
    
    if (!lead_id || !phone_number) {
      return res.status(400).json({ error: 'lead_id and phone_number required' });
    }
    
    const firstName = (name || 'there').trim().split(' ')[0];
    const message = `Hi ${firstName}! Thanks for your interest. We'll contact you within 24 hours.`;
    
    await pool.query(`
      INSERT INTO notifications (
        lead_id, phone_number, notification_type, title, message,
        delivery_channel, scheduled_time, status
      )
      VALUES ($1, $2, 'welcome', 'Welcome!', $3, 'whatsapp', CURRENT_TIMESTAMP, 'pending')
    `, [lead_id, phone_number, message]);
    
    res.json({ success: true, message: 'Welcome notification queued' });
  } catch (error) {
    console.error('Send welcome error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. SCHEDULE FOLLOW-UP CALL
app.post('/api/workflow/schedule-call', async (req, res) => {
  try {
    const { company_id, lead_id, hours_delay } = req.body;
    
    if (!company_id || !lead_id) {
      return res.status(400).json({ error: 'company_id and lead_id required' });
    }
    
    const delay = hours_delay || 2;
    const scheduledTime = new Date(Date.now() + delay * 60 * 60 * 1000);
    
    await pool.query(`
      INSERT INTO scheduled_calls (company_id, lead_id, call_type, scheduled_time, status)
      VALUES ($1, $2, 'qualification', $3, 'pending')
    `, [company_id, lead_id, scheduledTime.toISOString()]);
    
    res.json({ 
      success: true, 
      scheduled_time: scheduledTime.toISOString(),
      message: 'Follow-up call scheduled' 
    });
  } catch (error) {
    console.error('Schedule call error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. LOG IMPORT SUCCESS/FAILURE
app.post('/api/workflow/log-import', async (req, res) => {
  try {
    const {
      company_id,
      platform,
      lead_id,
      form_id,
      raw_data,
      mapped_data,
      status,
      error_message
    } = req.body;
    
    await pool.query(`
      INSERT INTO lead_import_logs (
        company_id, platform, lead_id, form_id,
        raw_data, mapped_data, status, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      company_id || 0,
      platform || 'unknown',
      lead_id,
      form_id,
      JSON.stringify(raw_data),
      JSON.stringify(mapped_data),
      status || 'success',
      error_message
    ]);
    
    res.json({ success: true, message: 'Import logged' });
  } catch (error) {
    console.error('Log import error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. GET LEAD SOURCE CONFIG BY TOKEN (Helper)
app.get('/api/lead-sources/config-by-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM lead_source_configs 
      WHERE webhook_url LIKE $1 AND is_active = TRUE
      LIMIT 1
    `, [`%${token}%`]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Config not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get config by token error:', error);
    res.status(500).json({ error: error.message });
  }
});






// ============================================
// SALES PERFORMANCE DASHBOARD API
// ============================================

// 1. PIPELINE OVERVIEW
// ============================================

app.get('/api/dashboard/pipeline', async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    const params = [company_id];
    let dateFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      params.push(start_date, end_date);
    }
    
    // Pipeline by stage
    const pipelineQuery = `
      SELECT 
        l.lead_status,
        COUNT(*) as count,
        COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter}
      GROUP BY l.lead_status
      ORDER BY 
        CASE l.lead_status
          WHEN 'new' THEN 1
          WHEN 'contacted' THEN 2
          WHEN 'qualified' THEN 3
          WHEN 'demo_scheduled' THEN 4
          WHEN 'proposal_sent' THEN 5
          WHEN 'negotiation' THEN 6
          WHEN 'closed_won' THEN 7
          WHEN 'closed_lost' THEN 8
          ELSE 9
        END
    `;
    
    const pipeline = await pool.query(pipelineQuery, params);
    
    // Conversion rates
    const conversionQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE lead_status = 'new') as new_leads,
        COUNT(*) FILTER (WHERE lead_status = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE lead_status = 'qualified') as qualified,
        COUNT(*) FILTER (WHERE lead_status IN ('demo_scheduled', 'proposal_sent')) as in_negotiation,
        COUNT(*) FILTER (WHERE lead_status = 'closed_won') as closed_won,
        COUNT(*) FILTER (WHERE lead_status = 'closed_lost') as closed_lost
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter}
    `;
    
    const conversion = await pool.query(conversionQuery, params);
    const stats = conversion.rows[0];
    
    // Calculate conversion rates
    const conversionRates = {
      new_to_contacted: stats.new_leads > 0 ? ((stats.contacted / stats.new_leads) * 100).toFixed(1) : 0,
      contacted_to_qualified: stats.contacted > 0 ? ((stats.qualified / stats.contacted) * 100).toFixed(1) : 0,
      qualified_to_negotiation: stats.qualified > 0 ? ((stats.in_negotiation / stats.qualified) * 100).toFixed(1) : 0,
      negotiation_to_won: stats.in_negotiation > 0 ? ((stats.closed_won / stats.in_negotiation) * 100).toFixed(1) : 0,
      overall_win_rate: (stats.closed_won + stats.closed_lost) > 0 ? ((stats.closed_won / (stats.closed_won + stats.closed_lost)) * 100).toFixed(1) : 0
    };
    
    logRequest('GET', '/api/dashboard/pipeline', 200);
    res.json({
      success: true,
      data: {
        pipeline: pipeline.rows,
        stats: stats,
        conversion_rates: conversionRates
      }
    });
    
  } catch (error) {
    logRequest('GET', '/api/dashboard/pipeline', 500);
    handleError(res, error);
  }
});

// 2. SALES PERFORMANCE METRICS
// ============================================

app.get('/api/dashboard/sales-performance', async (req, res) => {
  try {
    const { company_id, start_date, end_date, agent_id } = req.query;
    
    const params = [company_id];
    let dateFilter = '';
    let agentFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3'; // Fixed: Added table alias
      params.push(start_date, end_date);
    }
    
    if (agent_id) {
      agentFilter = ` AND l.assigned_to_agent = $${params.length + 1}`;
      params.push(agent_id);
    }
    
    // Overall sales metrics
    const metricsQuery = `
      SELECT 
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_won') as won_deals,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_lost') as lost_deals,
        AVG(l.interest_level) as avg_interest_level,
        COUNT(DISTINCT DATE(l.created_at)) as days_active
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter} ${agentFilter}
    `;
    
    const metrics = await pool.query(metricsQuery, params);
    
    // Call performance - Fixed date filter
    const callParams = [company_id];
    let callDateFilter = '';
    
    if (start_date && end_date) {
      callDateFilter = ' AND cl.created_at BETWEEN $2 AND $3'; // Fixed: Added table alias
      callParams.push(start_date, end_date);
    }
    
    const callQuery = `
      SELECT 
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE cl.call_status = 'completed') as completed_calls,
        COUNT(*) FILTER (WHERE cl.call_status = 'failed') as failed_calls,
        AVG(cl.call_duration) as avg_duration,
        COUNT(*) FILTER (WHERE cl.sentiment->>'sentiment' = 'positive') as positive_calls,
        COUNT(*) FILTER (WHERE cl.sentiment->>'sentiment' = 'negative') as negative_calls
      FROM call_logs cl
      WHERE cl.company_id = $1 ${callDateFilter}
    `;
    
    const callPerf = await pool.query(callQuery, callParams);
    
    // Message performance - Fixed date filter
    const msgParams = [company_id];
    let msgDateFilter = '';
    
    if (start_date && end_date) {
      msgDateFilter = ' AND wm.timestamp BETWEEN $2 AND $3'; // Fixed: Added table alias
      msgParams.push(start_date, end_date);
    }
    
    const msgQuery = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT wm.lead_id) as unique_leads_messaged,
        AVG(CASE WHEN wm.is_from_user THEN 1 ELSE 0 END) as user_message_ratio
      FROM whatsapp_messages wm
      JOIN leads l ON wm.lead_id = l.id
      WHERE l.company_id = $1 ${msgDateFilter}
    `;
    
    const msgPerf = await pool.query(msgQuery, msgParams);
    
    // Response time analysis
    const responseQuery = `
      WITH response_times AS (
        SELECT 
          wm.lead_id,
          wm.timestamp,
          LAG(wm.timestamp) OVER (PARTITION BY wm.lead_id ORDER BY wm.timestamp) as prev_timestamp,
          wm.is_from_user
        FROM whatsapp_messages wm
        WHERE wm.lead_id IN (SELECT id FROM leads WHERE company_id = $1)
      )
      SELECT 
        AVG(EXTRACT(EPOCH FROM (timestamp - prev_timestamp))) as avg_response_time_seconds
      FROM response_times
      WHERE is_from_user = FALSE AND prev_timestamp IS NOT NULL
    `;
    
    const responseTime = await pool.query(responseQuery, [company_id]);
    
    logRequest('GET', '/api/dashboard/sales-performance', 200);
    res.json({
      success: true,
      data: {
        sales_metrics: metrics.rows[0],
        call_performance: callPerf.rows[0],
        message_performance: msgPerf.rows[0],
        avg_response_time_minutes: responseTime.rows[0].avg_response_time_seconds 
          ? (responseTime.rows[0].avg_response_time_seconds / 60).toFixed(1) 
          : 0
      }
    });
    
  } catch (error) {
    logRequest('GET', '/api/dashboard/sales-performance', 500);
    handleError(res, error);
  }
});

// 3. LEAD SOURCE ANALYSIS
// ============================================

app.get('/api/dashboard/lead-sources', async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    const params = [company_id];
    let dateFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3'; // Fixed: Added table alias
      params.push(start_date, end_date);
    }
    
    // Source breakdown
    const sourceQuery = `
      SELECT 
        l.lead_source,
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_won') as converted_leads,
        AVG(l.interest_level) as avg_interest,
        (COUNT(*) FILTER (WHERE l.lead_status = 'closed_won')::float / 
         NULLIF(COUNT(*), 0) * 100) as conversion_rate
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter}
      GROUP BY l.lead_source
      ORDER BY total_leads DESC
    `;
    
    const sources = await pool.query(sourceQuery, params);
    
    // Platform-specific breakdown - Fixed date filter
    const platformParams = [company_id];
    let platformDateFilter = '';
    
    if (start_date && end_date) {
      platformDateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      platformParams.push(start_date, end_date);
    }
    
    const platformQuery = `
      SELECT 
        lsc.platform,
        lsc.form_name,
        COUNT(l.id) as total_leads,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_won') as converted_leads,
        COUNT(DISTINCT lil.id) FILTER (WHERE lil.status = 'success') as successful_imports,
        COUNT(DISTINCT lil.id) FILTER (WHERE lil.status = 'failed') as failed_imports,
        COUNT(DISTINCT lil.id) FILTER (WHERE lil.status = 'duplicate') as duplicate_imports
      FROM lead_source_configs lsc
      LEFT JOIN leads l ON l.lead_source_config_id = lsc.id ${platformDateFilter}
      LEFT JOIN lead_import_logs lil ON lil.form_id = lsc.form_id
      WHERE lsc.company_id = $1 AND lsc.is_active = TRUE
      GROUP BY lsc.platform, lsc.form_name, lsc.id
      ORDER BY total_leads DESC
    `;
    
    const platforms = await pool.query(platformQuery, platformParams);
    
    logRequest('GET', '/api/dashboard/lead-sources', 200);
    res.json({
      success: true,
      data: {
        sources: sources.rows,
        platforms: platforms.rows
      }
    });
    
  } catch (error) {
    logRequest('GET', '/api/dashboard/lead-sources', 500);
    handleError(res, error);
  }
});

// 4. AGENT PERFORMANCE LEADERBOARD
// ============================================

app.get('/api/dashboard/agent-leaderboard', async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    const params = [company_id];
    let dateFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      params.push(start_date, end_date);
    }
    
    const leaderboardQuery = `
      SELECT 
        l.assigned_to_agent as agent_name,
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_won') as won_deals,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_lost') as lost_deals,
        AVG(l.interest_level) as avg_interest,
        (COUNT(*) FILTER (WHERE l.lead_status = 'closed_won')::float / 
         NULLIF(COUNT(*), 0) * 100) as win_rate,
        COUNT(DISTINCT cl.id) as total_calls,
        AVG(cl.call_duration) as avg_call_duration,
        COUNT(DISTINCT wm.id) as total_messages
      FROM leads l
      LEFT JOIN call_logs cl ON l.id = cl.lead_id
      LEFT JOIN whatsapp_messages wm ON l.id = wm.lead_id AND wm.is_from_user = FALSE
      WHERE l.company_id = $1 
        AND l.assigned_to_agent IS NOT NULL
        ${dateFilter}
      GROUP BY l.assigned_to_agent
      ORDER BY won_deals DESC, win_rate DESC
      LIMIT 20
    `;
    
    const leaderboard = await pool.query(leaderboardQuery, params);
    
    logRequest('GET', '/api/dashboard/agent-leaderboard', 200);
    res.json({
      success: true,
      data: leaderboard.rows
    });
    
  } catch (error) {
    logRequest('GET', '/api/dashboard/agent-leaderboard', 500);
    handleError(res, error);
  }
});


// 5. TIME-SERIES ANALYTICS
// ============================================

app.get('/api/dashboard/trends', async (req, res) => {
  try {
    const { company_id, start_date, end_date, interval } = req.query;
    
    // interval can be 'day', 'week', 'month'
    const groupBy = interval === 'week' ? 'week' : interval === 'month' ? 'month' : 'day';
    
    const params = [company_id];
    let dateFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      params.push(start_date, end_date);
    }
    
    // Lead trends
    const leadTrendsQuery = `
      SELECT 
        DATE_TRUNC('${groupBy}', l.created_at) as period,
        COUNT(*) as new_leads,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_won') as won_deals,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_lost') as lost_deals,
        AVG(l.interest_level) as avg_interest
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter}
      GROUP BY DATE_TRUNC('${groupBy}', l.created_at)
      ORDER BY period ASC
    `;
    
    const leadTrends = await pool.query(leadTrendsQuery, params);
    
    // Call trends
    const callDateFilter = start_date && end_date ? ' AND cl.created_at BETWEEN $2 AND $3' : '';
    
    const callTrendsQuery = `
      SELECT 
        DATE_TRUNC('${groupBy}', cl.created_at) as period,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE cl.call_status = 'completed') as completed_calls,
        AVG(cl.call_duration) as avg_duration
      FROM call_logs cl
      WHERE cl.company_id = $1 ${callDateFilter}
      GROUP BY DATE_TRUNC('${groupBy}', cl.created_at)
      ORDER BY period ASC
    `;
    
    const callTrends = await pool.query(callTrendsQuery, params);
    
    logRequest('GET', '/api/dashboard/trends', 200);
    res.json({
      success: true,
      data: {
        lead_trends: leadTrends.rows,
        call_trends: callTrends.rows
      }
    });
    
  } catch (error) {
    logRequest('GET', '/api/dashboard/trends', 500);
    handleError(res, error);
  }
});

// 6. REVENUE ANALYTICS
// ============================================

app.get('/api/dashboard/revenue', async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    const params = [company_id];
    let dateFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND i.created_at BETWEEN $2 AND $3'; // Fixed: Added table alias
      params.push(start_date, end_date);
    }
    
    // Revenue breakdown
    const revenueQuery = `
      SELECT 
        SUM(i.amount) FILTER (WHERE i.status = 'paid') as total_revenue,
        SUM(i.amount) FILTER (WHERE i.status = 'pending') as pending_revenue,
        SUM(i.amount) FILTER (WHERE i.status = 'overdue') as overdue_revenue,
        COUNT(*) FILTER (WHERE i.status = 'paid') as paid_invoices,
        COUNT(*) FILTER (WHERE i.status = 'pending') as pending_invoices,
        AVG(i.amount) as avg_invoice_value,
        SUM(i.amount) FILTER (WHERE i.invoice_type = 'subscription') as recurring_revenue,
        SUM(i.amount) FILTER (WHERE i.invoice_type = 'one_time') as one_time_revenue
      FROM invoices i
      WHERE i.lead_id IN (SELECT id FROM leads WHERE company_id = $1)
      ${dateFilter}
    `;
    
    const revenue = await pool.query(revenueQuery, params);
    
    // Monthly recurring revenue trend
    const mrrQuery = `
      SELECT 
        DATE_TRUNC('month', i.created_at) as month,
        SUM(i.amount) FILTER (WHERE i.invoice_type = 'subscription' AND i.status = 'paid') as mrr
      FROM invoices i
      WHERE i.lead_id IN (SELECT id FROM leads WHERE company_id = $1)
      GROUP BY DATE_TRUNC('month', i.created_at)
      ORDER BY month DESC
      LIMIT 12
    `;
    
    const mrr = await pool.query(mrrQuery, [company_id]);
    
    logRequest('GET', '/api/dashboard/revenue', 200);
    res.json({
      success: true,
      data: {
        revenue_summary: revenue.rows[0],
        mrr_trend: mrr.rows
      }
    });
    
  } catch (error) {
    logRequest('GET', '/api/dashboard/revenue', 500);
    handleError(res, error);
  }
});

// 7. REAL-TIME DASHBOARD OVERVIEW
// ============================================

app.get('/api/dashboard/pipeline-overview', async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    const params = [company_id];
    let dateFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      params.push(start_date, end_date);
    }
    
    // Pipeline by stage
    const pipelineQuery = `
      SELECT 
        l.lead_status,
        COUNT(*) as count,
        COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter}
      GROUP BY l.lead_status
      ORDER BY 
        CASE l.lead_status
          WHEN 'new' THEN 1
          WHEN 'contacted' THEN 2
          WHEN 'qualified' THEN 3
          WHEN 'demo_scheduled' THEN 4
          WHEN 'proposal_sent' THEN 5
          WHEN 'negotiation' THEN 6
          WHEN 'closed_won' THEN 7
          WHEN 'closed_lost' THEN 8
          ELSE 9
        END
    `;
    
    const pipeline = await pool.query(pipelineQuery, params);
    
    // Conversion rates
    const conversionQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE lead_status = 'new') as new_leads,
        COUNT(*) FILTER (WHERE lead_status = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE lead_status = 'qualified') as qualified,
        COUNT(*) FILTER (WHERE lead_status IN ('demo_scheduled', 'proposal_sent')) as in_negotiation,
        COUNT(*) FILTER (WHERE lead_status = 'closed_won') as closed_won,
        COUNT(*) FILTER (WHERE lead_status = 'closed_lost') as closed_lost
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter}
    `;
    
    const conversion = await pool.query(conversionQuery, params);
    const stats = conversion.rows[0];
    
    // Calculate conversion rates
    const conversionRates = {
      new_to_contacted: stats.new_leads > 0 ? ((stats.contacted / stats.new_leads) * 100).toFixed(1) : 0,
      contacted_to_qualified: stats.contacted > 0 ? ((stats.qualified / stats.contacted) * 100).toFixed(1) : 0,
      qualified_to_negotiation: stats.qualified > 0 ? ((stats.in_negotiation / stats.qualified) * 100).toFixed(1) : 0,
      negotiation_to_won: stats.in_negotiation > 0 ? ((stats.closed_won / stats.in_negotiation) * 100).toFixed(1) : 0,
      overall_win_rate: (stats.closed_won + stats.closed_lost) > 0 ? ((stats.closed_won / (stats.closed_won + stats.closed_lost)) * 100).toFixed(1) : 0
    };
    
    logRequest('GET', '/api/dashboard/pipeline-overview', 200);
    res.json({
      success: true,
      data: {
        pipeline: pipeline.rows,
        stats: stats,
        conversion_rates: conversionRates
      }
    });
    
  } catch (error) {
    logRequest('GET', '/api/dashboard/pipeline-overview', 500);
    handleError(res, error);
  }
});





// ============================================
// AI-POWERED EMAIL INBOX SCANNING
// ============================================

// 1. EMAIL CONFIGURATION MANAGEMENT
// ============================================

app.post('/api/email-config', async (req, res) => {
  try {
    const {
      company_id,
      email_address,
      provider, // 'gmail', 'outlook', 'imap'
      imap_host,
      imap_port,
      imap_username,
      imap_password,
      scan_folders,
      ai_rules
    } = req.body;

    if (!company_id || !email_address || !provider) {
      return res.status(400).json({ error: 'company_id, email_address, and provider are required' });
    }

    // Encrypt credentials before storing (using crypto)
    // const crypto = require('crypto');
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'utf8');
    const iv = crypto.randomBytes(16);
    
    const encryptPassword = (password) => {
      if (!password) return null;
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(password, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + ':' + encrypted;
    };

    const query = `
      INSERT INTO email_configs (
        company_id, email_address, provider,
        imap_host, imap_port, imap_username, imap_password_encrypted,
        scan_folders, ai_rules, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
      ON CONFLICT (company_id, email_address) DO UPDATE
      SET 
        provider = EXCLUDED.provider,
        imap_host = EXCLUDED.imap_host,
        imap_port = EXCLUDED.imap_port,
        imap_username = EXCLUDED.imap_username,
        imap_password_encrypted = EXCLUDED.imap_password_encrypted,
        scan_folders = EXCLUDED.scan_folders,
        ai_rules = EXCLUDED.ai_rules,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, email_address, provider, scan_folders
    `;

    const result = await pool.query(query, [
      company_id,
      email_address,
      provider,
      imap_host || null,
      imap_port || null,
      imap_username || email_address,
      encryptPassword(imap_password),
      scan_folders || ['INBOX'],
      JSON.stringify(ai_rules || {})
    ]);

    logRequest('POST', '/api/email-config', 201);
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Email configuration saved. Scanning will start automatically.'
    });

  } catch (error) {
    logRequest('POST', '/api/email-config', 500);
    handleError(res, error);
  }
});

// 2. GET EMAIL CONFIGURATIONS
// ============================================

app.get('/api/email-config/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;

    const query = `
      SELECT 
        id, company_id, email_address, provider,
        imap_host, imap_port, scan_folders, ai_rules,
        is_active, last_scan_at, total_scanned,
        leads_extracted, created_at, updated_at
      FROM email_configs
      WHERE company_id = $1
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [company_id]);

    logRequest('GET', `/api/email-config/${company_id}`, 200);
    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    logRequest('GET', `/api/email-config/${company_id}`, 500);
    handleError(res, error);
  }
});

// 3. PROCESS EMAIL FOR LEAD EXTRACTION
// ============================================

app.post('/api/email/process', async (req, res) => {
  try {
    const {
      email_config_id,
      company_id,
      email_from,
      email_subject,
      email_body,
      email_date,
      message_id
    } = req.body;

    if (!company_id || !email_body) {
      return res.status(400).json({ error: 'company_id and email_body are required' });
    }

    // Use AI to extract lead information
    const extractedData = await extractLeadFromEmail({
      from: email_from,
      subject: email_subject,
      body: email_body,
      company_id: company_id
    });

    if (!extractedData.phone_number && !extractedData.email) {
      // No contact info found, log and skip
      await pool.query(`
        INSERT INTO email_scan_logs (
          email_config_id, company_id, message_id,
          from_email, subject, status, error_message
        )
        VALUES ($1, $2, $3, $4, $5, 'skipped', 'No contact information found')
      `, [email_config_id, company_id, message_id, email_from, email_subject]);

      return res.json({
        success: true,
        skipped: true,
        reason: 'No contact information found'
      });
    }

    // Normalize phone number
    let phone = extractedData.phone_number;
    if (phone) {
      phone = phone.replace(/\D/g, '');
      if (phone.length === 10) phone = '+91' + phone;
      else if (!phone.startsWith('+')) phone = '+' + phone;
    }

    // Check if lead exists
    let leadId;
    const existingLead = await pool.query(
      'SELECT id FROM leads WHERE phone_number = $1 OR email = $2',
      [phone, extractedData.email]
    );

    if (existingLead.rows.length > 0) {
      // Update existing lead
      leadId = existingLead.rows[0].id;
      await pool.query(`
        UPDATE leads
        SET 
          name = COALESCE($1, name),
          email = COALESCE($2, email),
          notes = COALESCE(notes || E'\\n', '') || $3,
          metadata = metadata || $4::jsonb,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
      `, [
        extractedData.name,
        extractedData.email,
        `Email received: ${email_subject}`,
        JSON.stringify({ email_source: email_from, email_date: email_date }),
        leadId
      ]);
    } else {
      // Create new lead
      const newLead = await pool.query(`
        INSERT INTO leads (
          company_id, phone_number, name, email,
          lead_source, notes, metadata
        )
        VALUES ($1, $2, $3, $4, 'email_inbox', $5, $6)
        RETURNING id
      `, [
        company_id,
        phone,
        extractedData.name || 'Email Lead',
        extractedData.email,
        `Email: ${email_subject}`,
        JSON.stringify({
          email_source: email_from,
          email_date: email_date,
          extracted_data: extractedData
        })
      ]);
      leadId = newLead.rows[0].id;
    }

    // Log successful extraction
    await pool.query(`
      INSERT INTO email_scan_logs (
        email_config_id, company_id, lead_id, message_id,
        from_email, subject, extracted_data, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'success')
    `, [
      email_config_id,
      company_id,
      leadId,
      message_id,
      email_from,
      email_subject,
      JSON.stringify(extractedData)
    ]);

    // Update email config stats
    await pool.query(`
      UPDATE email_configs
      SET 
        total_scanned = total_scanned + 1,
        leads_extracted = leads_extracted + 1,
        last_scan_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [email_config_id]);

    logRequest('POST', '/api/email/process', 200);
    res.json({
      success: true,
      lead_id: leadId,
      is_new: existingLead.rows.length === 0,
      extracted_data: extractedData
    });

  } catch (error) {
    logRequest('POST', '/api/email/process', 500);
    handleError(res, error);
  }
});

// 4. AI LEAD EXTRACTION FUNCTION
// ============================================

async function extractLeadFromEmail(emailData) {
  const { from, subject, body, company_id } = emailData;

  try {
    const rulesResult = await pool.query(
      'SELECT ai_rules FROM email_configs WHERE company_id = $1 AND is_active = TRUE LIMIT 1',
      [company_id]
    );

    const aiRules = rulesResult.rows[0]?.ai_rules || {};

    const groq = require('groq-sdk');
    const client = new groq.Groq({ apiKey: process.env.GROQ_API_KEY });

    const prompt = `
You are an intelligent email lead filter for a CRM system. Analyze this email and determine if it contains a potential business lead or inquiry.

STRICT FILTERING RULES:
- ONLY extract leads from emails that are BUSINESS INQUIRIES, SALES INQUIRIES, or CUSTOMER REQUESTS
- IGNORE: newsletters, notifications, marketing emails, automated reports, account updates, social media notifications, promotional emails
- IGNORE: "no-reply" addresses, automated system emails, digests, updates
- A valid lead MUST show clear intent to: inquire about services, request information, ask for quotes, express interest in products/services, or seek business engagement

Email Details:
From: ${from}
Subject: ${subject}
Body (first 2000 chars):
${body.substring(0, 2000)}

Additional Rules: ${JSON.stringify(aiRules)}

RESPOND WITH ONLY THIS JSON FORMAT:
{
  "is_lead": true/false,
  "reason": "Brief explanation why this is or isn't a lead",
  "confidence": "high|medium|low",
  "name": "Full name if found (or null)",
  "phone_number": "Phone number in any format (or null)",
  "email": "Email address (or null)",
  "company": "Company name if mentioned (or null)",
  "interest": "What they're interested in (or null)",
  "urgency": "low|medium|high",
  "lead_type": "inquiry|quote_request|support|sales|general|null",
  "next_action": "Recommended next step (or null)"
}

EXAMPLES OF VALID LEADS:
- "Hi, I'm interested in your web development services..."
- "Can you provide a quote for..."
- "I'd like to schedule a demo..."
- "We're looking for a solution that..."

EXAMPLES OF NON-LEADS (IGNORE THESE):
- "Your Medium Daily Digest"
- "Weekly newsletter from..."
- "Password reset request"
- "Your order has been shipped"
- "New follower on..."
- "Team update: Project status"

JSON:`;

    const completion = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 600
    });

    const responseText = completion.choices[0].message.content;
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const extractedData = JSON.parse(jsonMatch[0]);

    // CRITICAL: If AI says it's not a lead, return null immediately
    if (extractedData.is_lead === false || extractedData.confidence === 'low') {
      console.log(`Email filtered out: ${extractedData.reason}`);
      return {
        is_lead: false,
        reason: extractedData.reason,
        confidence: extractedData.confidence
      };
    }

    // Fallback regex extraction for contact info
    if (!extractedData.phone_number) {
      const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
      const phoneMatches = body.match(phoneRegex);
      if (phoneMatches && phoneMatches.length > 0) {
        extractedData.phone_number = phoneMatches[0];
      }
    }

    if (!extractedData.email) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emailMatches = body.match(emailRegex);
      if (emailMatches && emailMatches.length > 0) {
        extractedData.email = emailMatches[0];
      }
    }

    // Extract email from sender if not found
    if (!extractedData.email) {
      const senderEmailMatch = from.match(/<(.+?)>/) || from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      extractedData.email = senderEmailMatch ? (senderEmailMatch[1] || senderEmailMatch[0]) : from;
    }

    return extractedData;

  } catch (error) {
    console.error('AI extraction error:', error);
    
    // Fallback: Basic heuristic filtering
    const isLikelyLead = !from.toLowerCase().includes('noreply') && 
                         !from.toLowerCase().includes('no-reply') &&
                         !subject.toLowerCase().includes('newsletter') &&
                         !subject.toLowerCase().includes('digest') &&
                         !subject.toLowerCase().includes('notification');
    
    if (!isLikelyLead) {
      return {
        is_lead: false,
        reason: 'Automated or newsletter email detected',
        confidence: 'medium'
      };
    }
    
    return {
      is_lead: true,
      name: null,
      phone_number: extractPhoneFromText(body),
      email: extractEmailFromText(from + ' ' + body),
      company: null,
      interest: subject,
      urgency: 'medium',
      lead_type: 'general',
      next_action: 'Manual review needed',
      confidence: 'low'
    };
  }
}



function extractPhoneFromText(text) {
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const match = text.match(phoneRegex);
  return match ? match[0] : null;
}

function extractEmailFromText(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);
  return match ? match[0] : null;
}

// 5. GET EMAIL SCAN LOGS
// ============================================

app.get('/api/email/scan-logs/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    const { status, limit } = req.query;

    let query = `
      SELECT 
        esl.*,
        l.name as lead_name,
        l.phone_number,
        ec.email_address as scanned_inbox
      FROM email_scan_logs esl
      LEFT JOIN leads l ON esl.lead_id = l.id
      LEFT JOIN email_configs ec ON esl.email_config_id = ec.id
      WHERE esl.company_id = $1
    `;

    const params = [company_id];

    if (status) {
      params.push(status);
      query += ` AND esl.status = $${params.length}`;
    }

    query += ' ORDER BY esl.created_at DESC';

    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    } else {
      query += ' LIMIT 100';
    }

    const result = await pool.query(query, params);

    logRequest('GET', `/api/email/scan-logs/${company_id}`, 200);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });

  } catch (error) {
    logRequest('GET', `/api/email/scan-logs/${company_id}`, 500);
    handleError(res, error);
  }
});

// 6. TOGGLE EMAIL SCANNING
// ============================================

app.patch('/api/email-config/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const result = await pool.query(`
      UPDATE email_configs
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [is_active, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email config not found' });
    }

    logRequest('PATCH', `/api/email-config/${id}/toggle`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logRequest('PATCH', `/api/email-config/${id}/toggle`, 500);
    handleError(res, error);
  }
});

// 7. DELETE EMAIL CONFIGURATION
// ============================================

app.delete('/api/email-config/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM email_configs WHERE id = $1', [id]);

    logRequest('DELETE', `/api/email-config/${id}`, 200);
    res.json({
      success: true,
      message: 'Email configuration deleted'
    });

  } catch (error) {
    logRequest('DELETE', `/api/email-config/${id}`, 500);
    handleError(res, error);
  }
});





// ============================================
// MULTI-TENANT EMAIL INBOX SCANNING
// ============================================

// 1. GMAIL OAUTH SETUP (Per Company)
// ============================================

app.get('/api/email/oauth/gmail/start', async (req, res) => {
  try {
    const { company_id } = req.query;
    
    if (!company_id) {
      return res.status(400).json({ error: 'company_id required' });
    }
    
    const state = Buffer.from(JSON.stringify({
      company_id,
      provider: 'gmail',
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substr(2, 9)
    })).toString('base64');
    
    const redirectUri = `${process.env.BASE_URL}/api/email/oauth/gmail/callback`;
    


    const scopes = 'https://mail.google.com/';
    
    const authUrl = 
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${process.env.GMAIL_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `access_type=offline&` +
      `state=${encodeURIComponent(state)}&` +
      `prompt=consent`;
    
    res.json({ success: true, auth_url: authUrl });
  } catch (error) {
    console.error('Gmail OAuth start error:', error);
    res.status(500).json({ error: error.message });
  }
});





app.get('/api/email/oauth/gmail/callback', async (req, res) => {
  try {
    const { code, state, error: oauth_error } = req.query;
    
    if (oauth_error) {
      return res.status(400).send(`OAuth Error: ${oauth_error}`);
    }
    
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { company_id } = stateData;
    
    const redirectUri = `${process.env.BASE_URL}/api/email/oauth/gmail/callback`;
    
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        code: code,
        client_id: process.env.GMAIL_CLIENT_ID,
        client_secret: process.env.GMAIL_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }
    );
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // CRITICAL: Check if refresh_token is present
    if (!refresh_token) {
      console.error('No refresh token received from Google. User may have already authorized.');
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>OAuth Error</title></head>
        <body style="font-family: Arial; padding: 50px; text-align: center;">
          <div style="background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto;">
            <div style="color: #dc3545; font-size: 24px; margin-bottom: 20px;">⚠️ Authorization Issue</div>
            <p>No refresh token received. This usually happens when:</p>
            <ul style="text-align: left; display: inline-block;">
              <li>You've already authorized this app before</li>
              <li>The app needs to be re-authorized with fresh consent</li>
            </ul>
            <p style="margin-top: 20px;"><strong>Solution:</strong></p>
            <ol style="text-align: left; display: inline-block;">
              <li>Go to <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a></li>
              <li>Remove access for your app</li>
              <li>Try connecting again from the dashboard</li>
            </ol>
            <a href="/dashboard?tab=email-scanning" style="background: #007bff; color: white; padding: 12px 24px; border-radius: 5px; text-decoration: none; display: inline-block; margin-top: 20px;">Go to Dashboard</a>
          </div>
        </body>
        </html>
      `);
    }
    
    const profileResponse = await axios.get(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }
    );
    
    const emailAddress = profileResponse.data.emailAddress;
    
    // Encrypt tokens
    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = encryptToken(refresh_token);
    
    // Verify encryption worked
    if (!encryptedAccessToken || !encryptedRefreshToken) {
      throw new Error('Token encryption failed');
    }
    
    await pool.query(`
      INSERT INTO email_configs (
        company_id, email_address, provider,
        oauth_access_token, oauth_refresh_token,
        oauth_token_expires_at, scan_folders, is_active
      )
      VALUES ($1, $2, 'gmail', $3, $4, NOW() + $5 * INTERVAL '1 second', ARRAY['INBOX'], TRUE)
      ON CONFLICT (company_id, email_address) DO UPDATE
      SET 
        oauth_access_token = EXCLUDED.oauth_access_token,
        oauth_refresh_token = EXCLUDED.oauth_refresh_token,
        oauth_token_expires_at = EXCLUDED.oauth_token_expires_at,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `, [company_id, emailAddress, encryptedAccessToken, encryptedRefreshToken, expires_in]);
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Gmail Connected</title>
        <style>
          body { font-family: Arial; padding: 50px; background: #f5f5f5; text-align: center; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
          .btn { background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅ Gmail Connected Successfully!</div>
          <p><strong>Email:</strong> ${emailAddress}</p>
          <p>Your inbox will be automatically scanned for leads every 15 minutes.</p>
          <p style="margin-top: 30px;">
            <strong>What happens next:</strong><br>
            • Emails will be scanned for contact information<br>
            • Leads will be automatically extracted using AI<br>
            • New leads will receive welcome messages<br>
            • Follow-up calls will be scheduled automatically
          </p>
          <a href="/dashboard?tab=email-scanning" class="btn">Go to Dashboard</a>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Gmail OAuth callback error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body style="font-family: Arial; padding: 50px; text-align: center;">
        <div style="background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto;">
          <div style="color: #dc3545; font-size: 24px; margin-bottom: 20px;">❌ Connection Failed</div>
          <p>${error.message}</p>
          <a href="/dashboard?tab=email-scanning" style="background: #007bff; color: white; padding: 12px 24px; border-radius: 5px; text-decoration: none; display: inline-block; margin-top: 20px;">Try Again</a>
        </div>
      </body>
      </html>
    `);
  }
});




// 2. OUTLOOK/MICROSOFT OAUTH (Per Company)
// ============================================

app.get('/api/email/oauth/outlook/start', async (req, res) => {
  try {
    const { company_id } = req.query;
    
    if (!company_id) {
      return res.status(400).json({ error: 'company_id required' });
    }
    
    const state = Buffer.from(JSON.stringify({
      company_id,
      provider: 'outlook',
      timestamp: Date.now()
    })).toString('base64');
    
    const redirectUri = `${process.env.BASE_URL}/api/email/oauth/outlook/callback`;
    
    const scopes = [
      'https://graph.microsoft.com/Mail.Read',
      'https://graph.microsoft.com/Mail.ReadWrite',
      'https://graph.microsoft.com/Mail.Send',
      'offline_access'
    ].join(' ');
    
    const authUrl = 
      `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `client_id=${process.env.OUTLOOK_CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${encodeURIComponent(state)}&` +
      `prompt=consent`;
    
    res.json({ success: true, auth_url: authUrl });
  } catch (error) {
    console.error('Outlook OAuth start error:', error);
    res.status(500).json({ error: error.message });
  }
});




app.get('/api/email/oauth/outlook/callback', async (req, res) => {
  try {
    const { code, state, error: oauth_error } = req.query;
    
    if (oauth_error) {
      return res.status(400).send(`OAuth Error: ${oauth_error}`);
    }
    
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { company_id } = stateData;
    
    const redirectUri = `${process.env.BASE_URL}/api/email/oauth/outlook/callback`;
    
    const tokenResponse = await axios.post(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET,
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    if (!refresh_token) {
      throw new Error('No refresh token received from Microsoft. Please revoke and reconnect.');
    }
    
    const profileResponse = await axios.get(
      'https://graph.microsoft.com/v1.0/me',
      {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }
    );
    
    const emailAddress = profileResponse.data.userPrincipalName;
    
    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = encryptToken(refresh_token);
    
    if (!encryptedAccessToken || !encryptedRefreshToken) {
      throw new Error('Token encryption failed');
    }
    
    await pool.query(`
      INSERT INTO email_configs (
        company_id, email_address, provider,
        oauth_access_token, oauth_refresh_token,
        oauth_token_expires_at, scan_folders, is_active
      )
      VALUES ($1, $2, 'outlook', $3, $4, NOW() + $5 * INTERVAL '1 second', ARRAY['Inbox'], TRUE)
      ON CONFLICT (company_id, email_address) DO UPDATE
      SET 
        oauth_access_token = EXCLUDED.oauth_access_token,
        oauth_refresh_token = EXCLUDED.oauth_refresh_token,
        oauth_token_expires_at = EXCLUDED.oauth_token_expires_at,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP
    `, [company_id, emailAddress, encryptedAccessToken, encryptedRefreshToken, expires_in]);
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Outlook Connected</title></head>
      <body style="font-family: Arial; padding: 50px; text-align: center;">
        <div style="background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto;">
          <div style="color: #28a745; font-size: 24px; margin-bottom: 20px;">✅ Outlook Connected!</div>
          <p><strong>Email:</strong> ${emailAddress}</p>
          <p>Your inbox will be automatically scanned for leads.</p>
          <a href="/dashboard?tab=email-scanning" style="background: #007bff; color: white; padding: 12px 24px; border-radius: 5px; text-decoration: none; display: inline-block; margin-top: 20px;">Go to Dashboard</a>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Outlook OAuth callback error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});





// 3. GET EMAIL SCANNING STATUS (Per Company)
// ============================================

app.get('/api/email/status/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id, email_address, provider, is_active,
        last_scan_at, total_scanned, leads_extracted,
        oauth_token_expires_at,
        CASE 
          WHEN oauth_token_expires_at IS NULL THEN NULL
          WHEN oauth_token_expires_at < NOW() THEN 0
          ELSE GREATEST(0, EXTRACT(DAY FROM (oauth_token_expires_at - NOW()))::INTEGER)
        END as days_until_expiry,
        oauth_token_expires_at < NOW() as token_expired
      FROM email_configs
      WHERE company_id = $1
      ORDER BY created_at DESC
    `, [company_id]);
    
    logRequest('GET', `/api/email/status/${company_id}`, 200);
    res.json({
      success: true,
      data: result.rows.map(row => ({
        ...row,
        needs_reauth: row.token_expired || (row.days_until_expiry !== null && row.days_until_expiry < 7)
      }))
    });
    
  } catch (error) {
    console.error('Get email status error:', error);
    logRequest('GET', `/api/email/status/${company_id}`, 500);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});




// 4. DISCONNECT EMAIL ACCOUNT
// ============================================

app.delete('/api/email/disconnect/:email_config_id', async (req, res) => {
  try {
    const { email_config_id } = req.params;
    
    await pool.query(
      'DELETE FROM email_configs WHERE id = $1',
      [email_config_id]
    );
    
    res.json({
      success: true,
      message: 'Email account disconnected'
    });
    
  } catch (error) {
    console.error('Disconnect email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. SCAN EMAILS FOR SPECIFIC COMPANY (Called by n8n or cron)
// ============================================

app.post('/api/email/scan/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    
    // Get active email configs for this company
    const configs = await pool.query(`
      SELECT * FROM email_configs
      WHERE company_id = $1 AND is_active = TRUE
    `, [company_id]);
    
    if (configs.rows.length === 0) {
      return res.json({
        success: true,
        message: 'No active email configs found',
        scanned: 0,
        results: []
      });
    }
    
    const results = [];
    const errors = [];
    
    for (const config of configs.rows) {
      try {
        console.log(`Scanning emails for ${config.email_address}...`);
        
        // Get valid access token (auto-refreshes if needed)
        const accessToken = await getValidAccessToken(config);
        
        // Fetch unread emails based on provider
        let emails = [];
        
        if (config.provider === 'gmail') {
          emails = await fetchGmailEmails(accessToken, config);
        } else if (config.provider === 'outlook') {
          emails = await fetchOutlookEmails(accessToken, config);
        }
        
        console.log(`Found ${emails.length} unread emails for ${config.email_address}`);
        
        // Process each email
        for (const email of emails) {
          try {
            const processed = await processEmailForLead({
              email_config_id: config.id,
              company_id: config.company_id,
              email_from: email.from,
              email_subject: email.subject,
              email_body: email.body,
              email_date: email.date,
              message_id: email.id
            });
            
            if (!processed.skipped) {
              results.push(processed);
            }
          } catch (emailError) {
            console.error(`Email processing error for ${email.id}:`, emailError.message);
            errors.push({
              email_id: email.id,
              error: emailError.message
            });
          }
        }
        
        // Update last scan time
        await pool.query(
          'UPDATE email_configs SET last_scan_at = NOW() WHERE id = $1',
          [config.id]
        );
        
      } catch (configError) {
        console.error(`Config processing error for ${config.email_address}:`, configError.message);
        errors.push({
          email_address: config.email_address,
          error: configError.message
        });
      }
    }
    
    logRequest('POST', `/api/email/scan/${company_id}`, 200);
    res.json({
      success: true,
      scanned: results.length,
      results: results,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Email scan error:', error);
    logRequest('POST', `/api/email/scan/${company_id}`, 500);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});




const algorithm = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 32 bytes (32 chars)');
}
const KEY = Buffer.from(ENCRYPTION_KEY, 'utf8');

// FIXED IV — generated once at startup
const FIXED_IV = crypto.randomBytes(16); // 16 bytes for AES

function encryptToken(token) {
  if (!token) return null;
  const cipher = crypto.createCipheriv(algorithm, KEY, FIXED_IV);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return FIXED_IV.toString('hex') + ':' + encrypted;
}

function decryptToken(encryptedToken) {
  if (!encryptedToken) return null;
  const parts = encryptedToken.split(':');
  if (parts.length !== 2) return null;
  const [ivHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  try {
    const decipher = crypto.createDecipheriv(algorithm, KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return null;
  }
}





async function fetchGmailEmails(accessToken, config) {
  try {
    const response = await axios.get(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages',
      {
        params: {
          q: 'is:unread in:inbox',
          maxResults: 10
        },
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeout: 30000 // 30 second timeout
      }
    );
    
    if (!response.data.messages || response.data.messages.length === 0) {
      return [];
    }
    
    const emails = [];
    
    for (const message of response.data.messages) {
      try {
        const details = await axios.get(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            timeout: 30000
          }
        );
        
        const headers = details.data.payload.headers;
        const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value;
        
        // Decode body
        let body = '';
        if (details.data.payload.parts) {
          const textPart = details.data.payload.parts.find(p => p.mimeType === 'text/plain');
          if (textPart?.body?.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
          }
        } else if (details.data.payload.body?.data) {
          body = Buffer.from(details.data.payload.body.data, 'base64').toString('utf-8');
        }
        
        emails.push({
          id: message.id,
          from: getHeader('From') || 'Unknown',
          subject: getHeader('Subject') || 'No Subject',
          date: getHeader('Date') || new Date().toISOString(),
          body: body
        });
      } catch (messageError) {
        console.error(`Failed to fetch message ${message.id}:`, messageError.message);
        continue; // Skip this message, continue with others
      }
    }
    
    return emails;
    
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Token expired or invalid');
    }
    throw error;
  }
}


async function fetchOutlookEmails(accessToken, config) {
  try {
    const response = await axios.get(
      'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages',
      {
        params: {
          $filter: 'isRead eq false',
          $top: 10,
          $select: 'id,from,subject,receivedDateTime,body'
        },
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeout: 30000
      }
    );
    
    return response.data.value.map(email => ({
      id: email.id,
      from: email.from?.emailAddress?.address || 'Unknown',
      subject: email.subject || 'No Subject',
      date: email.receivedDateTime || new Date().toISOString(),
      body: email.body?.content || ''
    }));
    
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Token expired or invalid');
    }
    throw error;
  }
}




async function processEmailForLead(emailData) {
  const {
    email_config_id,
    company_id,
    email_from,
    email_subject,
    email_body,
    email_date,
    message_id
  } = emailData;
  
  try {
    // Check if already processed
    const existingLog = await pool.query(
      'SELECT id, status FROM email_scan_logs WHERE email_config_id = $1 AND message_id = $2',
      [email_config_id, message_id]
    );
    
    if (existingLog.rows.length > 0) {
      console.log(`Message ${message_id} already processed, skipping...`);
      return {
        skipped: true,
        reason: 'Already processed',
        existing_status: existingLog.rows[0].status
      };
    }
    
    // Extract and filter with AI
    const extractedData = await extractLeadFromEmail({
      from: email_from,
      subject: email_subject,
      body: email_body,
      company_id: company_id
    });
    
    // AI determined this is NOT a lead - skip it
    if (extractedData.is_lead === false) {
      await pool.query(`
        INSERT INTO email_scan_logs (
          email_config_id, company_id, message_id,
          from_email, subject, status, error_message, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'skipped', $6, NOW())
        ON CONFLICT (email_config_id, message_id) DO NOTHING
      `, [
        email_config_id, 
        company_id, 
        message_id, 
        email_from, 
        email_subject,
        `Not a lead: ${extractedData.reason}`
      ]);
      
      console.log(`Skipped non-lead email: ${email_subject} - ${extractedData.reason}`);
      return { 
        skipped: true, 
        reason: extractedData.reason,
        is_lead: false
      };
    }
    
    // Must have at least phone OR email to be a valid lead
    if (!extractedData.phone_number && !extractedData.email) {
      await pool.query(`
        INSERT INTO email_scan_logs (
          email_config_id, company_id, message_id,
          from_email, subject, status, error_message, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'skipped', 'No contact information found', NOW())
        ON CONFLICT (email_config_id, message_id) DO NOTHING
      `, [email_config_id, company_id, message_id, email_from, email_subject]);
      
      return { skipped: true, reason: 'No contact info' };
    }
    
    // Normalize phone
    let phone = extractedData.phone_number;
    if (phone) {
      phone = phone.replace(/\D/g, '');
      if (phone.length === 10) phone = '+91' + phone;
      else if (!phone.startsWith('+')) phone = '+' + phone;
    }
    
    // Check if lead exists
    let leadId;
    const existingLead = await pool.query(
      'SELECT id FROM leads WHERE (phone_number = $1 OR email = $2) AND company_id = $3',
      [phone, extractedData.email, company_id]
    );
    
    if (existingLead.rows.length > 0) {
      // Update existing lead
      leadId = existingLead.rows[0].id;
      await pool.query(`
        UPDATE leads
        SET 
          name = COALESCE($1, name),
          email = COALESCE($2, email),
          notes = COALESCE(notes || E'\\n\\n', '') || $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [
        extractedData.name, 
        extractedData.email, 
        `📧 Email (${new Date().toISOString().split('T')[0]}): ${email_subject}\n${extractedData.interest || ''}\nUrgency: ${extractedData.urgency || 'medium'}`,
        leadId
      ]);
    } else {
      // Create new lead
      const newLead = await pool.query(`
        INSERT INTO leads (
          company_id, phone_number, name, email,
          lead_source, notes
        )
        VALUES ($1, $2, $3, $4, 'email_inbox', $5)
        RETURNING id
      `, [
        company_id, 
        phone, 
        extractedData.name || 'Email Lead', 
        extractedData.email, 
        `📧 ${email_subject}\n\nType: ${extractedData.lead_type || 'inquiry'}\nInterest: ${extractedData.interest || 'N/A'}\nUrgency: ${extractedData.urgency || 'medium'}\nNext Action: ${extractedData.next_action || 'Follow up'}`
      ]);
      leadId = newLead.rows[0].id;
    }
    
    // Log success
    await pool.query(`
      INSERT INTO email_scan_logs (
        email_config_id, company_id, lead_id, message_id,
        from_email, subject, extracted_data, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'success', NOW())
      ON CONFLICT (email_config_id, message_id) 
      DO UPDATE SET 
        lead_id = EXCLUDED.lead_id,
        extracted_data = EXCLUDED.extracted_data,
        status = EXCLUDED.status
    `, [
      email_config_id, 
      company_id, 
      leadId, 
      message_id, 
      email_from, 
      email_subject, 
      JSON.stringify(extractedData)
    ]);
    
    // Update stats
    await pool.query(`
      UPDATE email_configs
      SET 
        total_scanned = total_scanned + 1,
        leads_extracted = leads_extracted + 1,
        last_scan_at = NOW()
      WHERE id = $1
    `, [email_config_id]);
    
    console.log(`✅ Lead created: ${extractedData.name || extractedData.email} (${extractedData.lead_type})`);
    
    return {
      success: true,
      lead_id: leadId,
      is_new: existingLead.rows.length === 0,
      extracted_data: extractedData,
      lead_type: extractedData.lead_type,
      confidence: extractedData.confidence
    };
    
  } catch (error) {
    console.error('Process email error:', error);
    
    try {
      await pool.query(`
        INSERT INTO email_scan_logs (
          email_config_id, company_id, message_id,
          from_email, subject, status, error_message, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'failed', $6, NOW())
        ON CONFLICT (email_config_id, message_id) 
        DO UPDATE SET 
          status = 'failed',
          error_message = EXCLUDED.error_message
      `, [email_config_id, company_id, message_id, email_from, email_subject, error.message]);
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    throw error;
  }
}




// Add this function to refresh expired tokens
async function refreshGmailToken(config) {
  try {
    const refreshToken = decryptToken(config.oauth_refresh_token);
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const response = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        client_id: process.env.GMAIL_CLIENT_ID,
        client_secret: process.env.GMAIL_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }
    );
    
    const { access_token, expires_in } = response.data;
    
    // Update database with new token
    await pool.query(`
      UPDATE email_configs
      SET 
        oauth_access_token = $1,
        oauth_token_expires_at = NOW() + '${expires_in} seconds'::interval,
        updated_at = NOW()
      WHERE id = $2
    `, [encryptToken(access_token), config.id]);
    
    return access_token;
    
  } catch (error) {
    console.error('Gmail token refresh failed:', error);
    
    // Mark config as requiring reauth
    await pool.query(`
      UPDATE email_configs
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
    `, [config.id]);
    
    throw new Error('Token refresh failed. Please reconnect your account.');
  }
}

async function refreshOutlookToken(config) {
  try {
    const refreshToken = decryptToken(config.oauth_refresh_token);
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const response = await axios.post(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    
    const { access_token, expires_in } = response.data;
    
    await pool.query(`
      UPDATE email_configs
      SET 
        oauth_access_token = $1,
        oauth_token_expires_at = NOW() + '${expires_in} seconds'::interval,
        updated_at = NOW()
      WHERE id = $2
    `, [encryptToken(access_token), config.id]);
    
    return access_token;
    
  } catch (error) {
    console.error('Outlook token refresh failed:', error);
    
    await pool.query(`
      UPDATE email_configs
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
    `, [config.id]);
    
    throw new Error('Token refresh failed. Please reconnect your account.');
  }
}

// Helper to get valid access token (with auto-refresh)
async function getValidAccessToken(config) {
  const now = new Date();
  const expiresAt = new Date(config.oauth_token_expires_at);
  
  // Refresh if expired or expiring in next 5 minutes
  if (expiresAt <= new Date(now.getTime() + 5 * 60 * 1000)) {
    console.log(`Token expired for ${config.email_address}, refreshing...`);
    
    if (config.provider === 'gmail') {
      return await refreshGmailToken(config);
    } else if (config.provider === 'outlook') {
      return await refreshOutlookToken(config);
    }
  }
  
  return decryptToken(config.oauth_access_token);
}




// ============================================
// GOOGLE CALENDAR OAUTH & INTEGRATION
// ============================================

app.get('/api/calendar/oauth/google/start', async (req, res) => {
  try {
    const { company_id, user_email } = req.query;
    
    if (!company_id || !user_email) {
      return res.status(400).json({ error: 'company_id and user_email required' });
    }
    
    const state = Buffer.from(JSON.stringify({
      company_id,
      user_email,
      provider: 'google',
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substr(2, 9)
    })).toString('base64');
    
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ].join(' ');
    
    const authUrl = 
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `access_type=offline&` +
      `state=${encodeURIComponent(state)}&` +
      `prompt=consent`;
    
    logRequest('GET', '/api/calendar/oauth/google/start', 200);
    res.json({ success: true, auth_url: authUrl });
    
  } catch (error) {
    console.error('Google Calendar OAuth start error:', error);
    logRequest('GET', '/api/calendar/oauth/google/start', 500);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/calendar/oauth/google/callback', async (req, res) => {
  try {
    const { code, state, error: oauth_error } = req.query;
    
    if (oauth_error) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>OAuth Error</title></head>
        <body style="font-family: Arial; padding: 50px; text-align: center;">
          <div style="background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto;">
            <div style="color: #dc3545; font-size: 24px; margin-bottom: 20px;">❌ OAuth Error</div>
            <p>${oauth_error}</p>
            <a href="/dashboard?tab=calendar" style="color: #667eea;">← Back to Dashboard</a>
          </div>
        </body>
        </html>
      `);
    }
    
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { company_id, user_email } = stateData;
    
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    
    // Exchange code for tokens
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        code: code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }
    );
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    if (!refresh_token) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Setup Required</title></head>
        <body style="font-family: Arial; padding: 50px; text-align: center;">
          <div style="background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto;">
            <div style="color: #ff9800; font-size: 24px; margin-bottom: 20px;">⚠️ Re-authorization Required</div>
            <p>Please revoke access in Google Account settings and try again.</p>
            <a href="https://myaccount.google.com/permissions" target="_blank" style="color: #667eea;">Google Permissions</a>
          </div>
        </body>
        </html>
      `);
    }
    
    // Get calendar info
    const calendarResponse = await axios.get(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList/primary',
      {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }
    );
    
    const calendarTimezone = calendarResponse.data.timeZone || 'Asia/Kolkata';
    
    // Encrypt tokens (reuse email encryption functions)
    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = encryptToken(refresh_token);
    
    if (!encryptedAccessToken || !encryptedRefreshToken) {
      throw new Error('Token encryption failed');
    }
    
    // Save to database
    await pool.query(`
      INSERT INTO calendar_configs (
        company_id, user_email, provider,
        oauth_access_token, oauth_refresh_token,
        oauth_token_expires_at, calendar_timezone, is_active
      )
      VALUES ($1, $2, 'google', $3, $4, NOW() + $5 * INTERVAL '1 second', $6, TRUE)
      ON CONFLICT (company_id, user_email, provider) DO UPDATE
      SET 
        oauth_access_token = EXCLUDED.oauth_access_token,
        oauth_refresh_token = EXCLUDED.oauth_refresh_token,
        oauth_token_expires_at = EXCLUDED.oauth_token_expires_at,
        calendar_timezone = EXCLUDED.calendar_timezone,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP
    `, [company_id, user_email, encryptedAccessToken, encryptedRefreshToken, expires_in, calendarTimezone]);
    
    logRequest('GET', '/api/calendar/oauth/google/callback', 200);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Calendar Connected</title>
        <style>
          body { font-family: Arial; padding: 50px; background: #f5f5f5; text-align: center; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto; }
          .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
          .btn { background: #667eea; color: white; padding: 12px 24px; border-radius: 5px; text-decoration: none; display: inline-block; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅ Google Calendar Connected!</div>
          <p><strong>Email:</strong> ${user_email}</p>
          <p><strong>Timezone:</strong> ${calendarTimezone}</p>
          <p>Your calendar is now integrated. Bookings will be automatically synced.</p>
          <a href="/dashboard?tab=calendar" class="btn">Go to Dashboard</a>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Google Calendar OAuth callback error:', error);
    logRequest('GET', '/api/calendar/oauth/google/callback', 500);
    res.status(500).send(`Error: ${error.message}`);
  }
});





// ============================================
// CALENDAR HELPER FUNCTIONS
// ============================================

async function getValidCalendarToken(calendar_config) {
  /**
   * Refresh Google Calendar token if expired
   */
  const now = new Date();
  const expiresAt = new Date(calendar_config.oauth_token_expires_at);
  
  if (expiresAt <= new Date(now.getTime() + 5 * 60 * 1000)) {
    console.log(`Calendar token expired for ${calendar_config.user_email}, refreshing...`);
    return await refreshCalendarToken(calendar_config);
  }
  
  return decryptToken(calendar_config.oauth_access_token);
}

async function refreshCalendarToken(calendar_config) {
  /**
   * Refresh expired Google Calendar token
   */
  try {
    const refreshToken = decryptToken(calendar_config.oauth_refresh_token);
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const response = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }
    );
    
    const { access_token, expires_in } = response.data;
    
    // Update in database
    await pool.query(`
      UPDATE calendar_configs
      SET 
        oauth_access_token = $1,
        oauth_token_expires_at = NOW() + $2 * INTERVAL '1 second',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [encryptToken(access_token), expires_in, calendar_config.id]);
    
    console.log(`✅ Calendar token refreshed for ${calendar_config.user_email}`);
    return access_token;
    
  } catch (error) {
    console.error('Calendar token refresh failed:', error);
    
    // Deactivate config
    await pool.query(`
      UPDATE calendar_configs
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [calendar_config.id]);
    
    throw new Error('Calendar token refresh failed. Please reconnect your account.');
  }
}


async function createGoogleCalendarEvent(calendar_config_id, eventData) {
  /**
   * Create event in Google Calendar
   * eventData: { title, description, start_time, end_time, attendees, lead_id, booking_id }
   */
  try {
    const config = await pool.query(
      'SELECT * FROM calendar_configs WHERE id = $1 AND is_active = TRUE',
      [calendar_config_id]
    );
    
    if (config.rows.length === 0) {
      throw new Error('Calendar config not found or inactive');
    }
    
    const calendarConfig = config.rows[0];
    const accessToken = await getValidCalendarToken(calendarConfig);
    
    // Format attendees
    const attendees = eventData.attendees?.map(email => ({ email })) || [];
    
    // Create event payload
    const event = {
      summary: eventData.title,
      description: eventData.description || '',
      start: {
        dateTime: new Date(eventData.start_time).toISOString(),
        timeZone: calendarConfig.calendar_timezone
      },
      end: {
        dateTime: new Date(eventData.end_time).toISOString(),
        timeZone: calendarConfig.calendar_timezone
      },
      attendees: attendees,
      conferenceData: {
        createRequest: {
          requestId: `meet_${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 }
        ]
      }
    };
    
    // Create event in Google Calendar
    const response = await axios.post(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarConfig.calendar_id}/events`,
      event,
      {
        params: { conferenceDataVersion: 1 },
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    const createdEvent = response.data;
    const meetingLink = createdEvent.hangoutLink || createdEvent.conferenceData?.entryPoints?.[0]?.uri;
    
    // Save to database - FIXED: Only insert lead_id if it exists and is valid
    const insertQuery = eventData.lead_id 
      ? `INSERT INTO calendar_events (
           calendar_config_id, lead_id, booking_id,
           event_id, title, description, start_time, end_time,
           attendees, meeting_link, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed')`
      : `INSERT INTO calendar_events (
           calendar_config_id, booking_id,
           event_id, title, description, start_time, end_time,
           attendees, meeting_link, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed')`;
    
    const insertParams = eventData.lead_id
      ? [
          calendar_config_id,
          eventData.lead_id,
          eventData.booking_id || null,
          createdEvent.id,
          eventData.title,
          eventData.description || null,
          eventData.start_time,
          eventData.end_time,
          JSON.stringify(attendees),
          meetingLink
        ]
      : [
          calendar_config_id,
          eventData.booking_id || null,
          createdEvent.id,
          eventData.title,
          eventData.description || null,
          eventData.start_time,
          eventData.end_time,
          JSON.stringify(attendees),
          meetingLink
        ];
    
    await pool.query(insertQuery, insertParams);
    
    console.log(`✅ Calendar event created: ${createdEvent.id}`);
    
    return {
      event_id: createdEvent.id,
      meeting_link: meetingLink,
      calendar_link: createdEvent.htmlLink
    };
    
  } catch (error) {
    console.error('Create calendar event error:', error.response?.data || error.message);
    throw error;
  }
}

async function checkCalendarAvailability(calendar_config_id, start_time, end_time) {
  /**
   * Check if time slot is available in calendar
   */
  try {
    const config = await pool.query(
      'SELECT * FROM calendar_configs WHERE id = $1 AND is_active = TRUE',
      [calendar_config_id]
    );
    
    if (config.rows.length === 0) {
      throw new Error('Calendar config not found');
    }
    
    const calendarConfig = config.rows[0];
    const accessToken = await getValidCalendarToken(calendarConfig);
    
    // Check free/busy
    const response = await axios.post(
      'https://www.googleapis.com/calendar/v3/freeBusy',
      {
        timeMin: new Date(start_time).toISOString(),
        timeMax: new Date(end_time).toISOString(),
        items: [{ id: calendarConfig.calendar_id }]
      },
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    const busySlots = response.data.calendars[calendarConfig.calendar_id]?.busy || [];
    const isAvailable = busySlots.length === 0;
    
    return {
      available: isAvailable,
      busy_slots: busySlots
    };
    
  } catch (error) {
    console.error('Check availability error:', error);
    throw error;
  }
}





// ============================================
// CALENDAR API ROUTES
// ============================================

app.get('/api/calendar/status/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id, user_email, provider, calendar_id, calendar_timezone,
        is_active, oauth_token_expires_at,
        EXTRACT(DAY FROM (oauth_token_expires_at - NOW())) as days_until_expiry
      FROM calendar_configs
      WHERE company_id = $1
      ORDER BY created_at DESC
    `, [company_id]);
    
    logRequest('GET', `/api/calendar/status/${company_id}`, 200);
    res.json({
      success: true,
      data: result.rows.map(row => ({
        ...row,
        needs_reauth: row.days_until_expiry < 7
      }))
    });
    
  } catch (error) {
    console.error('Get calendar status error:', error);
    logRequest('GET', `/api/calendar/status/${company_id}`, 500);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/calendar/create-event', async (req, res) => {
  try {
    const {
      calendar_config_id,
      lead_id,
      booking_id,
      title,
      description,
      start_time,
      end_time,
      attendees,
      send_confirmation = true // New parameter, default true
    } = req.body;
    
    // Validation
    if (!calendar_config_id || !title || !start_time || !end_time) {
      return res.status(400).json({
        error: 'calendar_config_id, title, start_time, end_time required'
      });
    }

    // Validate lead_id if provided
    let lead = null;
    if (lead_id) {
      const leadCheck = await pool.query(
        'SELECT id, email, name FROM leads WHERE id = $1',
        [lead_id]
      );
      
      if (leadCheck.rows.length === 0) {
        return res.status(400).json({
          error: 'Invalid lead_id: Lead does not exist'
        });
      }
      lead = leadCheck.rows[0];
    }
    
    // Get company_id from calendar config
    const configResult = await pool.query(
      'SELECT company_id FROM calendar_configs WHERE id = $1',
      [calendar_config_id]
    );
    
    if (configResult.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar config not found' });
    }
    
    const company_id = configResult.rows[0].company_id;
    
    // Prepare attendees list
    const attendeesList = attendees || (lead?.email ? [lead.email] : []);
    
    // Create calendar event (using your existing function)
    const calendarResult = await createGoogleCalendarEvent(calendar_config_id, {
      lead_id: lead_id || null,
      booking_id,
      title,
      description,
      start_time,
      end_time,
      attendees: attendeesList
    });
    
    // Get the created calendar event ID from database
    const eventResult = await pool.query(
      'SELECT id FROM calendar_events WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1',
      [calendarResult.event_id]
    );
    
    if (eventResult.rows.length === 0) {
      throw new Error('Calendar event created but not found in database');
    }
    
    const calendar_event_id = eventResult.rows[0].id;
    
    // Send confirmation email if requested and email is available
    let emailResult = null;
    if (send_confirmation) {
      emailResult = await sendCalendarConfirmationEmail(
        calendar_event_id,
        company_id,
        lead_id
      );
    }
    
    logRequest('POST', '/api/calendar/create-event', 201);
    res.status(201).json({
      success: true,
      data: {
        ...calendarResult,
        calendar_event_id,
        confirmation_email: emailResult
      },
      message: emailResult?.success 
        ? `Event created and confirmation email sent to ${emailResult.email_sent_to}` 
        : 'Event created successfully'
    });
    
  } catch (error) {
    console.error('Create event error:', error);
    logRequest('POST', '/api/calendar/create-event', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});




app.post('/api/calendar/check-availability', async (req, res) => {
  try {
    const { calendar_config_id, start_time, end_time } = req.body;
    
    if (!calendar_config_id || !start_time || !end_time) {
      return res.status(400).json({
        error: 'calendar_config_id, start_time, end_time required'
      });
    }
    
    const result = await checkCalendarAvailability(
      calendar_config_id,
      start_time,
      end_time
    );
    
    logRequest('POST', '/api/calendar/check-availability', 200);
    res.json({ success: true, data: result });
    
  } catch (error) {
    console.error('Check availability error:', error);
    logRequest('POST', '/api/calendar/check-availability', 500);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/calendar/disconnect/:calendar_config_id', async (req, res) => {
  try {
    const { calendar_config_id } = req.params;
    
    await pool.query(
      'DELETE FROM calendar_configs WHERE id = $1',
      [calendar_config_id]
    );
    
    logRequest('DELETE', `/api/calendar/disconnect/${calendar_config_id}`, 200);
    res.json({ success: true, message: 'Calendar disconnected' });
    
  } catch (error) {
    console.error('Disconnect calendar error:', error);
    logRequest('DELETE', `/api/calendar/disconnect/${calendar_config_id}`, 500);
    res.status(500).json({ error: error.message });
  }
});




// Get active calendar config for a company (for n8n workflows)
app.get('/api/calendar/active/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    
    // Get default calendar config, or first active one
    const result = await pool.query(`
      SELECT 
        id as calendar_config_id,
        user_email,
        calendar_id,
        calendar_timezone,
        is_active
      FROM calendar_configs
      WHERE company_id = $1 AND is_active = TRUE
      ORDER BY is_default DESC NULLS LAST, created_at ASC
      LIMIT 1
    `, [company_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'No active calendar configuration found',
        message: 'Please connect a Google Calendar account first'
      });
    }
    
    logRequest('GET', `/api/calendar/active/${company_id}`, 200);
    res.json({ 
      success: true, 
      data: result.rows[0] 
    });
    
  } catch (error) {
    console.error('Get active calendar error:', error);
    logRequest('GET', `/api/calendar/active/${company_id}`, 500);
    res.status(500).json({ error: error.message });
  }
});



// Get available time slots for a date range
app.post('/api/calendar/available-slots', async (req, res) => {
  try {
    const { 
      calendar_config_id, 
      start_date, 
      end_date,
      duration_minutes = 60,
      buffer_minutes = 15
    } = req.body;
    
    if (!calendar_config_id || !start_date || !end_date) {
      return res.status(400).json({
        error: 'calendar_config_id, start_date, end_date required'
      });
    }
    
    const config = await pool.query(
      'SELECT * FROM calendar_configs WHERE id = $1 AND is_active = TRUE',
      [calendar_config_id]
    );
    
    if (config.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar config not found' });
    }
    
    const calendarConfig = config.rows[0];
    const accessToken = await getValidCalendarToken(calendarConfig);
    
    // Get busy times from Google Calendar
    const response = await axios.post(
      'https://www.googleapis.com/calendar/v3/freeBusy',
      {
        timeMin: new Date(start_date).toISOString(),
        timeMax: new Date(end_date).toISOString(),
        items: [{ id: calendarConfig.calendar_id }]
      },
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    const busySlots = response.data.calendars[calendarConfig.calendar_id]?.busy || [];
    
    // Parse working hours from config
    const workingHours = calendarConfig.working_hours || {
      start: "09:00",
      end: "18:00",
      days: [1, 2, 3, 4, 5] // Mon-Fri
    };
    
    // Generate available slots
    const availableSlots = [];
    let currentDate = new Date(start_date);
    const endDateTime = new Date(end_date);
    
    while (currentDate <= endDateTime) {
      const dayOfWeek = currentDate.getDay();
      
      // Check if this day is a working day
      if (workingHours.days.includes(dayOfWeek)) {
        const [startHour, startMin] = workingHours.start.split(':').map(Number);
        const [endHour, endMin] = workingHours.end.split(':').map(Number);
        
        let slotStart = new Date(currentDate);
        slotStart.setHours(startHour, startMin, 0, 0);
        
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(endHour, endMin, 0, 0);
        
        // Generate slots for this day
        while (slotStart < dayEnd) {
          const slotEnd = new Date(slotStart.getTime() + duration_minutes * 60000);
          
          // Check if slot overlaps with busy times
          const isAvailable = !busySlots.some(busy => {
            const busyStart = new Date(busy.start);
            const busyEnd = new Date(busy.end);
            return (slotStart < busyEnd && slotEnd > busyStart);
          });
          
          if (isAvailable && slotEnd <= dayEnd) {
            availableSlots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              duration_minutes: duration_minutes
            });
          }
          
          // Move to next slot (including buffer)
          slotStart = new Date(slotStart.getTime() + (duration_minutes + buffer_minutes) * 60000);
        }
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }
    
    logRequest('POST', '/api/calendar/available-slots', 200);
    res.json({ 
      success: true, 
      data: {
        available_slots: availableSlots,
        timezone: calendarConfig.calendar_timezone,
        total_slots: availableSlots.length
      }
    });
    
  } catch (error) {
    console.error('Get available slots error:', error);
    logRequest('POST', '/api/calendar/available-slots', 500);
    res.status(500).json({ error: error.message });
  }
});





// ============================================
// CALENDAR CONFIRMATION EMAIL API
// ============================================

// Helper function to get company's email configuration
async function getCompanyEmailConfig(company_id) {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        email_address,
        provider,
        oauth_access_token,
        oauth_refresh_token,
        oauth_token_expires_at
      FROM email_configs
      WHERE company_id = $1 AND is_active = TRUE
      ORDER BY created_at DESC
      LIMIT 1
    `, [company_id]);
    
    if (result.rows.length === 0) {
      throw new Error('No active email configuration found for this company. Please connect an email account first.');
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error fetching email config:', error);
    throw error;
  }
}




// Helper function to create email transporter
async function createEmailTransporter(emailConfig) {
  try {
    // Get a fresh valid access token
    const accessToken = await getValidAccessToken(emailConfig);
    const refreshToken = decryptToken(emailConfig.oauth_refresh_token);
    
    if (emailConfig.provider === 'gmail') {
      // Gmail OAuth2 configuration for sending emails
      return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          type: 'OAuth2',
          user: emailConfig.email_address,
          clientId: process.env.GMAIL_CLIENT_ID,
          clientSecret: process.env.GMAIL_CLIENT_SECRET,
          refreshToken: refreshToken,
          accessToken: accessToken
        }
      });
    } else if (emailConfig.provider === 'outlook') {
      return nodemailer.createTransporter({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        auth: {
          type: 'OAuth2',
          user: emailConfig.email_address,
          clientId: process.env.OUTLOOK_CLIENT_ID,
          clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
          refreshToken: refreshToken,
          accessToken: accessToken
        }
      });
    } else {
      throw new Error(`Unsupported email provider: ${emailConfig.provider}`);
    }
  } catch (error) {
    console.error('Error creating email transporter:', error);
    throw error;
  }
}





// Generate email HTML template
function generateConfirmationEmailHTML(data) {
  const {
    lead_name,
    company_name,
    event_title,
    event_description,
    start_time,
    end_time,
    meeting_link,
    calendar_link,
    timezone
  } = data;
  
  const startDate = new Date(start_time);
  const endDate = new Date(end_time);
  
  const dateStr = startDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const timeStr = `${startDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  })} - ${endDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  })} ${timezone || 'IST'}`;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Appointment Confirmation</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background: white;
          border-radius: 10px;
          padding: 40px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 3px solid #667eea;
        }
        .header h1 {
          color: #667eea;
          margin: 0;
          font-size: 28px;
        }
        .check-icon {
          font-size: 48px;
          color: #28a745;
          margin-bottom: 10px;
        }
        .details {
          background: #f8f9fa;
          padding: 25px;
          border-radius: 8px;
          margin: 25px 0;
        }
        .detail-row {
          margin: 15px 0;
          padding: 10px 0;
          border-bottom: 1px solid #e9ecef;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: bold;
          color: #495057;
          display: block;
          margin-bottom: 5px;
        }
        .detail-value {
          color: #212529;
          font-size: 16px;
        }
        .meeting-link {
          background: #667eea;
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 5px;
          display: inline-block;
          margin: 20px 0;
          font-weight: bold;
        }
        .meeting-link:hover {
          background: #5568d3;
        }
        .calendar-link {
          background: #28a745;
          color: white;
          padding: 12px 25px;
          text-decoration: none;
          border-radius: 5px;
          display: inline-block;
          margin: 10px 5px;
          font-size: 14px;
        }
        .calendar-link:hover {
          background: #218838;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e9ecef;
          text-align: center;
          color: #6c757d;
          font-size: 14px;
        }
        .note {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="check-icon">✓</div>
          <h1>Appointment Confirmed!</h1>
          <p style="color: #6c757d; margin: 10px 0 0 0;">Your appointment has been successfully scheduled</p>
        </div>
        
        <p>Dear ${lead_name || 'Valued Customer'},</p>
        
        <p>This email confirms your upcoming appointment with <strong>${company_name}</strong>.</p>
        
        <div class="details">
          <div class="detail-row">
            <span class="detail-label">📅 Appointment Title</span>
            <span class="detail-value">${event_title}</span>
          </div>
          
          ${event_description ? `
          <div class="detail-row">
            <span class="detail-label">📝 Description</span>
            <span class="detail-value">${event_description}</span>
          </div>
          ` : ''}
          
          <div class="detail-row">
            <span class="detail-label">📆 Date</span>
            <span class="detail-value">${dateStr}</span>
          </div>
          
          <div class="detail-row">
            <span class="detail-label">🕐 Time</span>
            <span class="detail-value">${timeStr}</span>
          </div>
        </div>
        
        ${meeting_link ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${meeting_link}" class="meeting-link">Join Meeting</a>
          <p style="color: #6c757d; font-size: 14px; margin-top: 10px;">
            Click the button above to join the meeting at the scheduled time
          </p>
        </div>
        ` : ''}
        
        ${calendar_link ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${calendar_link}" class="calendar-link">View in Calendar</a>
        </div>
        ` : ''}
        
        <div class="note">
          <strong>⏰ Reminder:</strong> We'll send you a reminder 24 hours and 30 minutes before your appointment.
        </div>
        
        <p style="margin-top: 30px;">
          If you need to reschedule or cancel this appointment, please contact us as soon as possible.
        </p>
        
        <div class="footer">
          <p><strong>${company_name}</strong></p>
          <p>This is an automated confirmation email.</p>
          <p style="color: #adb5bd; font-size: 12px; margin-top: 15px;">
            Please do not reply to this email. For questions, contact our support team.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}



/**
 * Send confirmation email after calendar event creation
 */
async function sendCalendarConfirmationEmail(calendar_event_id, company_id, lead_id = null) {
  try {
    console.log(`📧 Attempting to send confirmation email for event ${calendar_event_id}...`);
    
    // Get calendar event details
    const eventResult = await pool.query(`
      SELECT 
        ce.*,
        cc.user_email as organizer_email,
        cc.calendar_timezone
      FROM calendar_events ce
      JOIN calendar_configs cc ON ce.calendar_config_id = cc.id
      WHERE ce.id = $1
    `, [calendar_event_id]);
    
    if (eventResult.rows.length === 0) {
      throw new Error('Calendar event not found');
    }
    
    const event = eventResult.rows[0];
    
    // Get lead details
    let lead = null;
    if (lead_id || event.lead_id) {
      const leadResult = await pool.query(`
        SELECT name, email, phone_number
        FROM leads
        WHERE id = $1
      `, [lead_id || event.lead_id]);
      
      if (leadResult.rows.length > 0) {
        lead = leadResult.rows[0];
      }
    }
    
    // Get attendees from event or use lead email
    const attendees = event.attendees ? (typeof event.attendees === 'string' ? JSON.parse(event.attendees) : event.attendees) : [];
    const recipientEmail = lead?.email || (attendees.length > 0 ? (attendees[0].email || attendees[0]) : null);
    
    if (!recipientEmail) {
      console.warn(`⚠️ No recipient email found for event ${calendar_event_id}. Skipping confirmation email.`);
      return {
        success: false,
        reason: 'No recipient email available'
      };
    }
    
    // Get company details
    const companyResult = await pool.query(
      'SELECT name FROM companies WHERE id = $1',
      [company_id]
    );
    
    if (companyResult.rows.length === 0) {
      throw new Error('Company not found');
    }
    
    const company = companyResult.rows[0];
    
    // Get company's email configuration
    const emailConfig = await getCompanyEmailConfig(company_id);
    
    // Create email transporter
    const transporter = await createEmailTransporter(emailConfig);
    
    // Prepare email data
    const emailData = {
      lead_name: lead?.name || 'Valued Customer',
      company_name: company.name,
      event_title: event.title,
      event_description: event.description,
      start_time: event.start_time,
      end_time: event.end_time,
      meeting_link: event.meeting_link,
      calendar_link: event.calendar_link || `https://calendar.google.com/calendar/event?eid=${event.event_id}`,
      timezone: event.calendar_timezone
    };
    
    // Generate email HTML
    const emailHTML = generateConfirmationEmailHTML(emailData);
    
    // Send email
    const mailOptions = {
      from: `${company.name} <${emailConfig.email_address}>`,
      to: recipientEmail,
      subject: `Appointment Confirmation - ${event.title}`,
      html: emailHTML
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    // Log email sent
    await pool.query(`
      INSERT INTO email_queue (
        to_email,
        subject,
        body,
        lead_id,
        status,
        sent_at
      )
      VALUES ($1, $2, $3, $4, 'sent', NOW())
    `, [
      recipientEmail,
      mailOptions.subject,
      'Appointment confirmation email',
      lead_id || event.lead_id
    ]);
    
    // Update calendar event to mark confirmation sent
    await pool.query(`
      UPDATE calendar_events
      SET reminder_sent = TRUE
      WHERE id = $1
    `, [calendar_event_id]);
    
    console.log(`✅ Confirmation email sent successfully to ${recipientEmail}`);
    
    return {
      success: true,
      email_sent_to: recipientEmail,
      message_id: info.messageId
    };
    
  } catch (error) {
    console.error('❌ Send confirmation email error:', error);
    
    // Log the error but don't fail the entire calendar creation
    try {
      await pool.query(`
        INSERT INTO email_queue (
          to_email,
          subject,
          body,
          lead_id,
          status,
          error_message
        )
        VALUES ($1, $2, $3, $4, 'failed', $5)
      `, [
        'unknown',
        'Calendar Confirmation',
        'Failed to send',
        lead_id,
        error.message
      ]);
    } catch (logError) {
      console.error('Failed to log email error:', logError);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}



/**
 * Send confirmation email for an existing calendar event
 */
app.post('/api/calendar/send-confirmation', async (req, res) => {
  try {
    const {
      calendar_event_id,
      company_id,
      lead_id
    } = req.body;
    
    if (!calendar_event_id || !company_id) {
      return res.status(400).json({
        error: 'calendar_event_id and company_id are required'
      });
    }
    
    const result = await sendCalendarConfirmationEmail(
      calendar_event_id,
      company_id,
      lead_id
    );
    
    if (result.success) {
      logRequest('POST', '/api/calendar/send-confirmation', 200);
      res.json({
        success: true,
        message: 'Confirmation email sent successfully',
        email_sent_to: result.email_sent_to,
        message_id: result.message_id
      });
    } else {
      logRequest('POST', '/api/calendar/send-confirmation', 400);
      res.status(400).json({
        success: false,
        error: result.error || result.reason
      });
    }
    
  } catch (error) {
    console.error('Send confirmation email error:', error);
    logRequest('POST', '/api/calendar/send-confirmation', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});





/**
 * Resend confirmation email for existing event
 */
app.post('/api/calendar/resend-confirmation/:event_id', async (req, res) => {
  try {
    const { event_id } = req.params;
    
    // Get event and company details
    const eventResult = await pool.query(`
      SELECT 
        ce.id,
        ce.lead_id,
        cc.company_id
      FROM calendar_events ce
      JOIN calendar_configs cc ON ce.calendar_config_id = cc.id
      WHERE ce.id = $1
    `, [event_id]);
    
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }
    
    const event = eventResult.rows[0];
    
    const result = await sendCalendarConfirmationEmail(
      event.id,
      event.company_id,
      event.lead_id
    );
    
    if (result.success) {
      logRequest('POST', `/api/calendar/resend-confirmation/${event_id}`, 200);
      res.json({
        success: true,
        message: 'Confirmation email resent successfully',
        email_sent_to: result.email_sent_to
      });
    } else {
      logRequest('POST', `/api/calendar/resend-confirmation/${event_id}`, 400);
      res.status(400).json({
        success: false,
        error: result.error || result.reason
      });
    }
    
  } catch (error) {
    console.error('Resend confirmation error:', error);
    logRequest('POST', `/api/calendar/resend-confirmation/${event_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});






/**
 * Get email sending status for a calendar event
 */
app.get('/api/calendar/email-status/:event_id', async (req, res) => {
  try {
    const { event_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        ce.id,
        ce.reminder_sent,
        ce.title,
        ce.start_time,
        eq.to_email,
        eq.status as email_status,
        eq.sent_at,
        eq.error_message
      FROM calendar_events ce
      LEFT JOIN email_queue eq ON eq.lead_id = ce.lead_id 
        AND eq.subject LIKE '%' || ce.title || '%'
        AND eq.created_at >= ce.created_at
      WHERE ce.id = $1
      ORDER BY eq.created_at DESC
      LIMIT 1
    `, [event_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }
    
    logRequest('GET', `/api/calendar/email-status/${event_id}`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Get email status error:', error);
    logRequest('GET', `/api/calendar/email-status/${event_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



// module.exports = {
//   sendCalendarConfirmationEmail,
//   generateConfirmationEmailHTML,
//   getCompanyEmailConfig,
//   createEmailTransporter
// };




// // Enhanced multi-language WhatsApp message handler
// async function handleMultilingualWhatsAppMessage(message, agentInstance, fromPhone) {
//   try {
//     const leadResult = await pool.query(
//       'SELECT preferred_language FROM leads WHERE phone_number = $1',
//       [fromPhone]
//     );
    
//     const preferredLang = leadResult.rows[0]?.preferred_language || 'en';
//     const detectedLang = detectLanguage(message);
    
//     // If user switched language, update their preference
//     if (detectedLang !== preferredLang && detectedLang !== 'en') {
//       await pool.query(
//         'UPDATE leads SET preferred_language = $1 WHERE phone_number = $2',
//         [detectedLang, fromPhone]
//       );
//       console.log(`🔄 Language updated: ${preferredLang} → ${detectedLang} for ${fromPhone}`);
//     }
    
//     const activeLang = detectedLang !== 'en' ? detectedLang : preferredLang;
    
//     // Translate message to English for AI processing
//     let messageForAI = message;
//     if (activeLang !== 'en') {
//       messageForAI = await translateText(message, 'en', activeLang);
//     }
    
//     return {
//       originalMessage: message,
//       translatedMessage: messageForAI,
//       detectedLanguage: detectedLang,
//       preferredLanguage: activeLang,
//       needsTranslation: activeLang !== 'en'
//     };
//   } catch (error) {
//     console.error('Multi-lingual handling error:', error);
//     return {
//       originalMessage: message,
//       translatedMessage: message,
//       detectedLanguage: 'en',
//       preferredLanguage: 'en',
//       needsTranslation: false
//     };
//   }
// }




async function handleMultilingualWhatsAppMessage(message, agentInstance, fromPhone) {
  try {
    const leadResult = await pool.query(
      'SELECT preferred_language FROM leads WHERE phone_number = $1',
      [fromPhone]
    );
    
    const preferredLang = leadResult.rows[0]?.preferred_language || 'en';
    const detectedLang = await detectLanguage(message);

    // Update language preference if changed
    if (detectedLang !== preferredLang && detectedLang !== 'en') {
      await pool.query(
        'UPDATE leads SET preferred_language = $1 WHERE phone_number = $2',
        [detectedLang, fromPhone]
      );
      console.log(`🔄 Language updated: ${preferredLang} → ${detectedLang} for ${fromPhone}`);
    }
    
    const activeLang = detectedLang !== 'en' ? detectedLang : preferredLang;

    // Translate to English for AI processing
    let messageForAI = message;
    if (activeLang !== 'en') {
      messageForAI = await translateText(message, 'en', activeLang);
    }
    
    return {
      originalMessage: message,
      translatedMessage: messageForAI,
      detectedLanguage: detectedLang,
      preferredLanguage: activeLang,
      needsTranslation: activeLang !== 'en'
    };
  } catch (error) {
    console.error('Multi-lingual handling error:', error);
    return {
      originalMessage: message,
      translatedMessage: message,
      detectedLanguage: 'en',
      preferredLanguage: 'en',
      needsTranslation: false
    };
  }
}




// Enhanced WhatsApp response sender with translation
async function sendWhatsAppResponse(agentInstance, toPhone, message, leadLanguage = 'en') {
  try {
    const credentials = agentInstance.whatsapp_credentials;

    // Translate from English to lead's language
    let finalMessage = message;
    if (leadLanguage !== 'en') {
      finalMessage = await translateText(message, leadLanguage, 'en');
    }
    
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
      {
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: { body: finalMessage }
      },
      {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Save to database
    await pool.query(`
      INSERT INTO whatsapp_messages 
      (lead_id, phone_number, message_type, message_body, sender, is_from_user, message_id)
      SELECT id, $1, 'text', $2, 'bot', FALSE, $3
      FROM leads WHERE phone_number = $1
    `, [toPhone, finalMessage, response.data.messages[0].id]);
    
    return response.data;
  } catch (error) {
    console.error('WhatsApp send error:', error);
    throw error;
  }
}



// WhatsApp Appointment Scheduling
app.post('/api/whatsapp/schedule-appointment', async (req, res) => {
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
    
    // Get lead info
    const leadResult = await pool.query(
      'SELECT id, name, email, preferred_language FROM leads WHERE phone_number = $1',
      [lead_phone]
    );
    
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = leadResult.rows[0];
    
    // Get agent and company info
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
    
    // Get active calendar config
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
    
    // Parse date and time
    const appointmentDate = new Date(preferred_date);
    if (preferred_time) {
      const [hours, minutes] = preferred_time.split(':');
      appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else {
      appointmentDate.setHours(14, 0, 0, 0); // Default 2 PM
    }
    
    const endTime = new Date(appointmentDate.getTime() + duration_minutes * 60000);
    
    // Check availability
    const availability = await checkCalendarAvailability(
      calendar_config_id,
      appointmentDate.toISOString(),
      endTime.toISOString()
    );
    
    if (!availability.available) {
      // Send alternative slots via WhatsApp
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
    
    // Create booking
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
    
    // Create calendar event
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
    
    // Update booking with calendar event
    await pool.query(`
      UPDATE bookings
      SET calendar_event_id = $1, status = 'confirmed'
      WHERE id = $2
    `, [calendarEvent.event_id, booking_id]);
    
    // Send confirmation via WhatsApp
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
    
    // Send confirmation email if email exists
    if (lead.email) {
      await sendCalendarConfirmationEmail(
        calendarEvent.calendar_event_id,
        agent.company_id,
        lead.id
      );
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
});

// Helper: Generate alternative slots message
// async function generateAlternativeSlotsMessage(calendar_config_id, requestedDate, language = 'en') {
//   const startDate = new Date(requestedDate);
//   startDate.setHours(0, 0, 0, 0);
//   const endDate = new Date(startDate);
//   endDate.setDate(endDate.getDate() + 7); // Next 7 days
  
//   const response = await axios.post(
//     `${process.env.BASE_URL}/api/calendar/available-slots`,
//     {
//       calendar_config_id,
//       start_date: startDate.toISOString(),
//       end_date: endDate.toISOString(),
//       duration_minutes: 60
//     }
//   );
  
//   const slots = response.data.data.available_slots.slice(0, 5); // First 5 slots
  
//   let message = '⚠️ The requested time is not available.\n\n';
//   message += '📅 Available slots:\n\n';
  
//   slots.forEach((slot, index) => {
//     const slotDate = new Date(slot.start);
//     const dateStr = slotDate.toLocaleDateString('en-IN', {
//       weekday: 'short',
//       day: 'numeric',
//       month: 'short'
//     });
//     const timeStr = slotDate.toLocaleTimeString('en-IN', {
//       hour: '2-digit',
//       minute: '2-digit',
//       hour12: true
//     });
//     message += `${index + 1}. ${dateStr} at ${timeStr}\n`;
//   });
  
//   message += '\nReply with the slot number to book!';
  
//   if (language !== 'en') {
//     message = await translateText(message, language, 'en');
//   }
  
//   return message;
// }



async function generateAlternativeSlotsMessage(calendarConfigId, requestedDate, language) {
  let message = `⚠️ The requested time slot is not available.\n\n`;
  message += `Here are some alternative times:\n`;
  
  // Fetch alternative slots (implement your logic here)
  const slots = await getAvailableSlots(calendarConfigId, requestedDate);
  
  slots.slice(0, 3).forEach((slot, index) => {
    const slotDate = new Date(slot.start);
    const dateStr = slotDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
    message += `${index + 1}. ${dateStr}\n`;
  });
  
  message += `\nReply with the number of your preferred slot.`;

  // Translate if needed
  if (language !== 'en') {
    message = await translateText(message, language, 'en');
  }

  return message;
}

// Helper: Generate WhatsApp confirmation
async function generateWhatsAppConfirmation(lead, appointmentDate, meetingLink, companyName) {
  const dateStr = appointmentDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let message = `✅ Appointment Confirmed!\n\n`;
  message += `📅 Date: ${dateStr}\n`;
  message += `🏢 Company: ${companyName}\n`;
  if (meetingLink) {
    message += `🔗 Meeting Link: ${meetingLink}\n`;
  }
  message += `\nWe look forward to meeting you!`;

  // Translate if needed
  const leadLang = lead.preferred_language || 'en';
  if (leadLang !== 'en') {
    message = await translateText(message, leadLang, 'en');
  }

  return message;
}




// WhatsApp Invoice Sharing
app.post('/api/whatsapp/send-invoice', async (req, res) => {
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
    
    // Get invoice details
    const invoiceResult = await pool.query(`
      SELECT i.*, l.name as lead_name, l.email, l.preferred_language
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      WHERE i.id = $1 AND i.phone_number = $2
    `, [invoice_id, lead_phone]);
    
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const invoice = invoiceResult.rows[0];
    
    // Get agent instance
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
    
    // Generate invoice message
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
    
    // Translate if needed
    if (invoice.preferred_language !== 'en') {
      message = await translateText(message, invoice.preferred_language, 'en');
    }
    
    // Send via WhatsApp
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
    
    // Update invoice reminder tracking
    await pool.query(`
      UPDATE invoices
      SET 
        reminder_count = reminder_count + 1,
        last_reminder_sent = NOW()
      WHERE id = $1
    `, [invoice_id]);
    
    // Log the message
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
});

// Auto-send invoice reminders (call this via cron job)
app.post('/api/whatsapp/send-invoice-reminders', async (req, res) => {
  try {
    // Get overdue invoices that haven't been reminded recently
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
      
      // Rate limiting: 1 message per second
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
});





// AI Lead Scoring Engine
async function calculateLeadScore(lead_id) {
  try {
    const leadData = await pool.query(`
      SELECT 
        l.*,
        COUNT(DISTINCT cl.id) as total_calls,
        COUNT(DISTINCT wm.id) as total_messages,
        AVG((cl.sentiment->>'tone_score')::int) as avg_sentiment,
        COUNT(DISTINCT b.id) as total_bookings,
        COUNT(DISTINCT i.id) as total_invoices,
        MAX(cl.created_at) as last_call_date,
        MAX(wm.timestamp) as last_message_date
      FROM leads l
      LEFT JOIN call_logs cl ON l.id = cl.lead_id
      LEFT JOIN whatsapp_messages wm ON l.id = wm.lead_id
      LEFT JOIN bookings b ON l.id = b.lead_id
      LEFT JOIN invoices i ON l.id = i.lead_id
      WHERE l.id = $1
      GROUP BY l.id
    `, [lead_id]);
    
    if (leadData.rows.length === 0) {
      throw new Error('Lead not found');
    }
    
    const lead = leadData.rows[0];
    
    // Scoring components (0-100 scale)
    let score = 0;
    const breakdown = {};
    
    // 1. Engagement Score (30 points)
    const callScore = Math.min((lead.total_calls || 0) * 5, 15);
    const messageScore = Math.min((lead.total_messages || 0) * 0.5, 15);
    breakdown.engagement = callScore + messageScore;
    score += breakdown.engagement;
    
    // 2. Interest Level (20 points)
    breakdown.interest = (lead.interest_level || 1) * 2;
    score += breakdown.interest;
    
    // 3. Sentiment Score (20 points)
    if (lead.avg_sentiment) {
      breakdown.sentiment = (lead.avg_sentiment / 10) * 20;
      score += breakdown.sentiment;
    } else {
      breakdown.sentiment = 10; // Default neutral
      score += 10;
    }
    
    // 4. Conversion Indicators (20 points)
    const bookingPoints = (lead.total_bookings || 0) * 5;
    const invoicePoints = (lead.total_invoices || 0) * 5;
    breakdown.conversion = Math.min(bookingPoints + invoicePoints, 20);
    score += breakdown.conversion;
    
    // 5. Recency (10 points)
    const now = new Date();
    const lastInteraction = lead.last_call_date || lead.last_message_date || lead.last_contacted;
    
    if (lastInteraction) {
      const daysSince = (now - new Date(lastInteraction)) / (1000 * 60 * 60 * 24);
      
      if (daysSince <= 1) breakdown.recency = 10;
      else if (daysSince <= 3) breakdown.recency = 8;
      else if (daysSince <= 7) breakdown.recency = 5;
      else if (daysSince <= 14) breakdown.recency = 3;
      else breakdown.recency = 1;
      
      score += breakdown.recency;
    } else {
      breakdown.recency = 0;
    }
    
    // Normalize to 0-100
    score = Math.min(Math.round(score), 100);
    
    // Determine grade
    let grade;
    if (score >= 80) grade = 'A'; // Hot lead
    else if (score >= 60) grade = 'B'; // Warm lead
    else if (score >= 40) grade = 'C'; // Lukewarm
    else if (score >= 20) grade = 'D'; // Cold
    else grade = 'F'; // Very cold
    
    // Store in metadata
    await pool.query(`
      UPDATE leads
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{lead_score}',
        $1::jsonb
      )
      WHERE id = $2
    `, [
      JSON.stringify({
        score,
        grade,
        breakdown,
        calculated_at: new Date().toISOString()
      }),
      lead_id
    ]);
    
    return { score, grade, breakdown };
    
  } catch (error) {
    console.error('Lead scoring error:', error);
    throw error;
  }
}

// Endpoint: Calculate lead score
app.post('/api/leads/:lead_id/calculate-score', async (req, res) => {
  try {
    const { lead_id } = req.params;
    
    const scoreData = await calculateLeadScore(lead_id);
    
    logRequest('POST', `/api/leads/${lead_id}/calculate-score`, 200);
    res.json({
      success: true,
      lead_id: parseInt(lead_id),
      ...scoreData
    });
    
  } catch (error) {
    console.error('Calculate score error:', error);
    logRequest('POST', `/api/leads/${lead_id}/calculate-score`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Batch scoring endpoint
app.post('/api/leads/batch-calculate-scores', async (req, res) => {
  try {
    const { company_id, lead_ids } = req.body;
    
    let query = 'SELECT id FROM leads WHERE 1=1';
    const params = [];
    
    if (company_id) {
      params.push(company_id);
      query += ` AND company_id = $${params.length}`;
    }
    
    if (lead_ids && lead_ids.length > 0) {
      params.push(lead_ids);
      query += ` AND id = ANY($${params.length})`;
    }
    
    query += ' LIMIT 1000'; // Safety limit
    
    const leadsResult = await pool.query(query, params);
    
    const results = [];
    const errors = [];
    
    for (const lead of leadsResult.rows) {
      try {
        const scoreData = await calculateLeadScore(lead.id);
        results.push({
          lead_id: lead.id,
          ...scoreData
        });
      } catch (error) {
        errors.push({
          lead_id: lead.id,
          error: error.message
        });
      }
    }
    
    logRequest('POST', '/api/leads/batch-calculate-scores', 200);
    res.json({
      success: true,
      processed: results.length,
      failed: errors.length,
      results,
      errors
    });
    
  } catch (error) {
    console.error('Batch scoring error:', error);
    logRequest('POST', '/api/leads/batch-calculate-scores', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get top leads by score
app.get('/api/leads/top-scored', async (req, res) => {
  try {
    const { company_id, limit = 50, min_grade = 'C' } = req.query;
    
    const gradeOrder = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'F': 5 };
    const minGradeValue = gradeOrder[min_grade] || 3;
    
    let query = `
      SELECT 
        l.*,
        (l.metadata->'lead_score'->>'score')::int as score,
        l.metadata->'lead_score'->>'grade' as grade,
        l.metadata->'lead_score'->'breakdown' as score_breakdown
      FROM leads l
      WHERE l.metadata->'lead_score' IS NOT NULL
    `;
    
    const params = [];
    
    if (company_id) {
      params.push(company_id);
      query += ` AND l.company_id = $${params.length}`;
    }
    
    query += ` ORDER BY (l.metadata->'lead_score'->>'score')::int DESC`;
    
    params.push(parseInt(limit));
    query += ` LIMIT $${params.length}`;
    
    const result = await pool.query(query, params);
    
    // Filter by grade
    const filteredLeads = result.rows.filter(lead => 
      gradeOrder[lead.grade] <= minGradeValue
    );
    
    logRequest('GET', '/api/leads/top-scored', 200);
    res.json({
      success: true,
      count: filteredLeads.length,
      data: filteredLeads
    });
    
  } catch (error) {
    console.error('Top scored leads error:', error);
    logRequest('GET', '/api/leads/top-scored', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});




// Smart Routing Rules Engine
app.post('/api/routing-rules', async (req, res) => {
  try {
    const {
      company_id,
      rule_name,
      rule_type, // 'score_based', 'source_based', 'language_based', 'time_based'
      conditions,
      action, // 'assign_agent', 'priority_queue', 'auto_call', 'send_notification'
      target_agent_id,
      priority,
      is_active = true
    } = req.body;
    
    if (!company_id || !rule_name || !rule_type || !conditions || !action) {
      return res.status(400).json({
        error: 'company_id, rule_name, rule_type, conditions, and action required'
      });
    }
    
    const query = `
      INSERT INTO routing_rules (
        company_id, rule_name, rule_type, conditions,
        action, target_agent_id, priority, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      company_id,
      rule_name,
      rule_type,
      JSON.stringify(conditions),
      action,
      target_agent_id || null,
      priority || 50,
      is_active
    ]);
    
    logRequest('POST', '/api/routing-rules', 201);
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Create routing rule error:', error);
    logRequest('POST', '/api/routing-rules', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});




// Apply routing rules to a lead
async function applyRoutingRules(lead_id, company_id) {
  try {
    // Get lead data with score
    const leadResult = await pool.query(`
      SELECT 
        l.*,
        (l.metadata->'lead_score'->>'score')::int as score,
        l.metadata->'lead_score'->>'grade' as grade
      FROM leads l
      WHERE l.id = $1 AND l.company_id = $2
    `, [lead_id, company_id]);
    
    if (leadResult.rows.length === 0) {
      throw new Error('Lead not found');
    }
    
    const lead = leadResult.rows[0];
    
    // Get active routing rules for company
    const rulesResult = await pool.query(`
      SELECT * FROM routing_rules
      WHERE company_id = $1 AND is_active = TRUE
      ORDER BY priority DESC, created_at ASC
    `, [company_id]);
    
    const appliedActions = [];
    
    for (const rule of rulesResult.rows) {
      const conditions = rule.conditions;
      let conditionMet = false;
      
      // Evaluate conditions based on rule type
      switch (rule.rule_type) {
        case 'score_based':
          if (conditions.min_score && lead.score >= conditions.min_score) {
            conditionMet = true;
          }
          if (conditions.grade && conditions.grade.includes(lead.grade)) {
            conditionMet = true;
          }
          break;
          
        case 'source_based':
          if (conditions.sources && conditions.sources.includes(lead.lead_source)) {
            conditionMet = true;
          }
          break;
          
        case 'language_based':
          if (conditions.languages && conditions.languages.includes(lead.preferred_language)) {
            conditionMet = true;
          }
          break;
          
        case 'time_based':
          const currentHour = new Date().getHours();
          if (conditions.hours) {
            conditionMet = currentHour >= conditions.hours.start && 
                          currentHour <= conditions.hours.end;
          }
          break;
          
        case 'custom':
          // Evaluate custom conditions
          if (conditions.status && conditions.status.includes(lead.lead_status)) {
            conditionMet = true;
          }
          if (conditions.interest_level && lead.interest_level >= conditions.interest_level) {
            conditionMet = true;
          }
          break;
      }
      
      // Execute action if condition is met
      if (conditionMet) {
        let actionResult = null;
        
        switch (rule.action) {
          case 'assign_agent':
            if (rule.target_agent_id) {
              await pool.query(`
                UPDATE leads
                SET assigned_to_agent = (
                  SELECT name FROM human_agents WHERE id = $1
                )
                WHERE id = $2
              `, [rule.target_agent_id, lead_id]);
              
              actionResult = { type: 'assigned', agent_id: rule.target_agent_id };
            }
            break;
            
          case 'priority_queue':
            await pool.query(`
              UPDATE leads
              SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{priority}',
                '"high"'
              )
              WHERE id = $1
            `, [lead_id]);
            
            actionResult = { type: 'priority_set', priority: 'high' };
            break;
            
          case 'auto_call':
            // Schedule immediate callback
            await pool.query(`
              INSERT INTO scheduled_calls (
                company_id, lead_id, call_type, scheduled_time, status
              )
              VALUES ($1, $2, 'callback', NOW() + INTERVAL '5 minutes', 'pending')
            `, [company_id, lead_id]);
            
            actionResult = { type: 'call_scheduled', scheduled_in: '5 minutes' };
            break;
            
          case 'send_notification':
            // Create notification for assigned agent or default
            const notificationMessage = conditions.notification_message || 
              `New lead ${lead.name || lead.phone_number} needs attention`;
            
            await pool.query(`
              INSERT INTO system_notifications (
                notification_type, title, message, priority
              )
              VALUES ('lead_routing', $1, $2, 'high')
            `, [`Lead #${lead_id} routed`, notificationMessage]);
            
            actionResult = { type: 'notification_sent' };
            break;
            
          case 'tag_lead':
            if (conditions.tags) {
              await pool.query(`
                UPDATE leads
                SET tags = array_cat(COALESCE(tags, ARRAY[]::text[]), $1)
                WHERE id = $2
              `, [conditions.tags, lead_id]);
              
              actionResult = { type: 'tags_added', tags: conditions.tags };
            }
            break;
        }
        
        if (actionResult) {
          appliedActions.push({
            rule_id: rule.id,
            rule_name: rule.rule_name,
            ...actionResult
          });
          
          // Log routing action
          await pool.query(`
            INSERT INTO audit_logs (lead_id, action, details, created_by)
            VALUES ($1, 'routing_rule_applied', $2, 'system')
          `, [lead_id, JSON.stringify({
            rule_id: rule.id,
            rule_name: rule.rule_name,
            action: rule.action,
            result: actionResult
          })]);
        }
      }
    }
    
    return appliedActions;
    
  } catch (error) {
    console.error('Apply routing rules error:', error);
    throw error;
  }
}

// Endpoint: Apply routing to lead
app.post('/api/leads/:lead_id/apply-routing', async (req, res) => {
  const { lead_id } = req.params; // Define at the top of function
  
  try {
    const { company_id } = req.body;
    
    if (!company_id) {
      return res.status(400).json({ error: 'company_id required' });
    }
    
    const actions = await applyRoutingRules(lead_id, company_id);
    
    logRequest('POST', `/api/leads/${lead_id}/apply-routing`, 200);
    res.json({
      success: true,
      lead_id: parseInt(lead_id),
      actions_applied: actions.length,
      actions
    });
    
  } catch (error) {
    console.error('Apply routing error:', error);
    logRequest('POST', `/api/leads/${lead_id}/apply-routing`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get routing rules for company
app.get('/api/routing-rules/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        rr.*,
        ha.name as assigned_agent_name
      FROM routing_rules rr
      LEFT JOIN human_agents ha ON rr.target_agent_id = ha.id
      WHERE rr.company_id = $1
      ORDER BY rr.priority DESC, rr.created_at DESC
    `, [company_id]);
    
    logRequest('GET', `/api/routing-rules/${company_id}`, 200);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get routing rules error:', error);
    logRequest('GET', `/api/routing-rules/${company_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update routing rule
app.patch('/api/routing-rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      rule_name,
      conditions,
      action,
      target_agent_id,
      priority,
      is_active
    } = req.body;
    
    const updates = [];
    const params = [];
    let paramCount = 0;
    
    if (rule_name) {
      paramCount++;
      updates.push(`rule_name = $${paramCount}`);
      params.push(rule_name);
    }
    
    if (conditions) {
      paramCount++;
      updates.push(`conditions = $${paramCount}`);
      params.push(JSON.stringify(conditions));
    }
    
    if (action) {
      paramCount++;
      updates.push(`action = $${paramCount}`);
      params.push(action);
    }
    
    if (target_agent_id !== undefined) {
      paramCount++;
      updates.push(`target_agent_id = $${paramCount}`);
      params.push(target_agent_id);
    }
    
    if (priority !== undefined) {
      paramCount++;
      updates.push(`priority = $${paramCount}`);
      params.push(priority);
    }
    
    if (is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      params.push(is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(id);
    
    const query = `
      UPDATE routing_rules
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Routing rule not found' });
    }
    
    logRequest('PATCH', `/api/routing-rules/${id}`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Update routing rule error:', error);
    logRequest('PATCH', `/api/routing-rules/${id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete routing rule
app.delete('/api/routing-rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM routing_rules WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Routing rule not found' });
    }
    
    logRequest('DELETE', `/api/routing-rules/${id}`, 200);
    res.json({
      success: true,
      message: 'Routing rule deleted',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Delete routing rule error:', error);
    logRequest('DELETE', `/api/routing-rules/${id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});




// Task Management System

// Create task
app.post('/api/tasks', async (req, res) => {
  try {
    const {
      company_id,
      lead_id,
      assigned_to_agent_id,
      task_type, // 'follow_up', 'callback', 'email', 'meeting', 'demo'
      title,
      description,
      due_date,
      priority = 'medium', // 'low', 'medium', 'high', 'urgent'
      reminder_before_minutes = 30
    } = req.body;
    
    if (!company_id || !lead_id || !task_type || !title) {
      return res.status(400).json({
        error: 'company_id, lead_id, task_type, and title required'
      });
    }
    
    const query = `
      INSERT INTO tasks (
        company_id, lead_id, assigned_to_agent_id,
        task_type, title, description, due_date,
        priority, reminder_before_minutes, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      company_id,
      lead_id,
      assigned_to_agent_id || null,
      task_type,
      title,
      description || null,
      due_date || null,
      priority,
      reminder_before_minutes
    ]);
    
    // Auto-assign if no agent specified
    if (!assigned_to_agent_id && lead_id) {
      const leadAgent = await pool.query(
        'SELECT assigned_to_agent FROM leads WHERE id = $1',
        [lead_id]
      );
      
      if (leadAgent.rows[0]?.assigned_to_agent) {
        const agentResult = await pool.query(
          'SELECT id FROM human_agents WHERE name = $1',
          [leadAgent.rows[0].assigned_to_agent]
        );
        
        if (agentResult.rows.length > 0) {
          await pool.query(
            'UPDATE tasks SET assigned_to_agent_id = $1 WHERE id = $2',
            [agentResult.rows[0].id, result.rows[0].id]
          );
        }
      }
    }
    
    // Send notification to assigned agent
    if (assigned_to_agent_id) {
      await pool.query(`
        INSERT INTO system_notifications (
          notification_type, title, message, priority
        )
        VALUES ('task_assigned', $1, $2, $3)
      `, [
        `New Task: ${title}`,
        `You have been assigned a ${task_type} task for Lead #${lead_id}`,
        priority
      ]);
    }
    
    logRequest('POST', '/api/tasks', 201);
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Create task error:', error);
    logRequest('POST', '/api/tasks', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get tasks for agent
app.get('/api/tasks/agent/:agent_id', async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status, priority, limit = 50 } = req.query;
    
    let query = `
      SELECT 
        t.*,
        l.name as lead_name,
        l.phone_number,
        l.email,
        l.company_id
      FROM tasks t
      JOIN leads l ON t.lead_id = l.id
      WHERE t.assigned_to_agent_id = $1
    `;
    
    const params = [agent_id];
    
    if (status) {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }
    
    if (priority) {
      params.push(priority);
      query += ` AND t.priority = $${params.length}`;
    }
    
    query += ` ORDER BY 
      CASE t.priority 
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC
    `;
    
    params.push(parseInt(limit));
    query += ` LIMIT $${params.length}`;
    
    const result = await pool.query(query, params);
    
    logRequest('GET', `/api/tasks/agent/${agent_id}`, 200);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get agent tasks error:', error);
    logRequest('GET', `/api/tasks/agent/${agent_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get tasks for lead
app.get('/api/tasks/lead/:lead_id', async (req, res) => {
  try {
    const { lead_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        t.*,
        ha.name as assigned_agent_name,
        ha.email as agent_email
      FROM tasks t
      LEFT JOIN human_agents ha ON t.assigned_to_agent_id = ha.id
      WHERE t.lead_id = $1
      ORDER BY t.created_at DESC
    `, [lead_id]);
    
    logRequest('GET', `/api/tasks/lead/${lead_id}`, 200);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get lead tasks error:', error);
    logRequest('GET', `/api/tasks/lead/${lead_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update task
app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      assigned_to_agent_id,
      due_date,
      priority,
      notes
    } = req.body;
    
    const updates = [];
    const params = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(status);
      
      if (status === 'completed') {
        paramCount++;
        updates.push(`completed_at = $${paramCount}`);
        params.push(new Date().toISOString());
      }
    }
    
    if (assigned_to_agent_id !== undefined) {
      paramCount++;
      updates.push(`assigned_to_agent_id = $${paramCount}`);
      params.push(assigned_to_agent_id);
    }
    
    if (due_date) {
      paramCount++;
      updates.push(`due_date = $${paramCount}`);
      params.push(due_date);
    }
    
    if (priority) {
      paramCount++;
      updates.push(`priority = $${paramCount}`);
      params.push(priority);
    }
    
    if (notes) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      params.push(notes);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(id);
    
    const query = `
      UPDATE tasks
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    logRequest('PATCH', `/api/tasks/${id}`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Update task error:', error);
    logRequest('PATCH', `/api/tasks/${id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    logRequest('DELETE', `/api/tasks/${id}`, 200);
    res.json({
      success: true,
      message: 'Task deleted',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Delete task error:', error);
    logRequest('DELETE', `/api/tasks/${id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get overdue tasks
app.get('/api/tasks/overdue/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        t.*,
        l.name as lead_name,
        l.phone_number,
        ha.name as assigned_agent_name
      FROM tasks t
      JOIN leads l ON t.lead_id = l.id
      LEFT JOIN human_agents ha ON t.assigned_to_agent_id = ha.id
      WHERE t.company_id = $1
      AND t.status NOT IN ('completed', 'cancelled')
      AND t.due_date < NOW()
      ORDER BY t.due_date ASC
    `, [company_id]);
    
    logRequest('GET', `/api/tasks/overdue/${company_id}`, 200);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get overdue tasks error:', error);
    logRequest('GET', `/api/tasks/overdue/${company_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Auto-create tasks from routing rules
async function autoCreateTask(lead_id, company_id, task_config) {
  try {
    await pool.query(`
      INSERT INTO tasks (
        company_id, lead_id, task_type, title,
        description, due_date, priority, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
    `, [
      company_id,
      lead_id,
      task_config.type || 'follow_up',
      task_config.title,
      task_config.description || null,
      task_config.due_date || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      task_config.priority || 'medium'
    ]);
    
    console.log(`✅ Auto-created task for lead ${lead_id}`);
  } catch (error) {
    console.error('Auto-create task error:', error);
  }
}




// Parse user slot selection from WhatsApp message
function parseSlotSelection(messageText) {
  // Match patterns like "1", "slot 1", "book 2", "option 3"
  const patterns = [
    /^(\d+)$/,                    // Just "1"
    /slot\s*(\d+)/i,              // "slot 1"
    /book\s*(\d+)/i,              // "book 1"
    /option\s*(\d+)/i,            // "option 1"
    /number\s*(\d+)/i,            // "number 1"
    /^(\d+)\./                    // "1."
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
app.post('/api/whatsapp/handle-booking-flow', async (req, res) => {
  try {
    const {
      agent_instance_id,
      lead_phone,
      message_text
    } = req.body;
    
    if (!agent_instance_id || !lead_phone || !message_text) {
      return res.status(400).json({
        error: 'agent_instance_id, lead_phone, and message_text required'
      });
    }
    
    // Check if message is a slot selection
    const slotNumber = parseSlotSelection(message_text);
    
    if (slotNumber) {
      // First check if conversations table has metadata column
      const tableCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='conversations' AND column_name='metadata'
      `);
      
      if (tableCheck.rows.length === 0) {
        // Metadata column doesn't exist, return graceful error
        return res.json({
          success: false,
          message: 'Booking flow metadata not available. Please upgrade database schema.'
        });
      }


      // Get pending slot options from conversation context
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
          
          // Book the appointment
          const bookingResponse = await axios.post(
            `${process.env.BASE_URL}/api/whatsapp/schedule-appointment`,
            {
              agent_instance_id,
              lead_phone,
              preferred_date: selectedSlot.start,
              duration_minutes: selectedSlot.duration_minutes || 60
            }
          );
          
          // Clear pending slots
          await pool.query(`
            UPDATE conversations
            SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{pending_appointment_slots}',
              '[]'::jsonb
            )
            WHERE phone_number = $1
          `, [lead_phone]);
          
          return res.json({
            success: true,
            slot_selected: slotNumber,
            booking_confirmed: true,
            booking_data: bookingResponse.data
          });
        }
      }
    }
    
    // Not a slot selection - handle as regular booking request
    res.json({
      success: true,
      slot_selected: null,
      booking_confirmed: false,
      message: 'Not a slot selection'
    });
    
  } catch (error) {
    console.error('Booking flow error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});




// Complete Lead Analytics Dashboard
app.get('/api/analytics/leads-complete/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    const params = [company_id];
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      params.push(start_date, end_date);
    }
    
    // Overall statistics
    const overallStats = await pool.query(`
      SELECT 
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE lead_status = 'new') as new_leads,
        COUNT(*) FILTER (WHERE lead_status = 'qualified') as qualified_leads,
        COUNT(*) FILTER (WHERE lead_status = 'closed_won') as won_leads,
        COUNT(*) FILTER (WHERE lead_status = 'closed_lost') as lost_leads,
        AVG(interest_level) as avg_interest,
        AVG((metadata->'lead_score'->>'score')::int) FILTER (WHERE metadata->'lead_score' IS NOT NULL) as avg_score
      FROM leads
      WHERE company_id = $1 ${dateFilter}
    `, params);
    
    // Source breakdown
    const sourceStats = await pool.query(`
      SELECT 
        lead_source,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE lead_status = 'closed_won') as conversions,
        AVG((metadata->'lead_score'->>'score')::int) FILTER (WHERE metadata->'lead_score' IS NOT NULL) as avg_score
      FROM leads
      WHERE company_id = $1 ${dateFilter}
      GROUP BY lead_source
      ORDER BY count DESC
    `, params);
    
    // Language distribution
    const languageStats = await pool.query(`
      SELECT 
        preferred_language,
        COUNT(*) as count
      FROM leads 
      WHERE company_id = $1 ${dateFilter}
      GROUP BY preferred_language
    `, params);
    
    // Score distribution
    const scoreStats = await pool.query(`
      SELECT 
        metadata->'lead_score'->>'grade' as grade,
        COUNT(*) as count
      FROM leads 
      WHERE company_id = $1 
      AND metadata->'lead_score' IS NOT NULL
      ${dateFilter}
      GROUP BY metadata->'lead_score'->>'grade'
      ORDER BY 
        CASE metadata->'lead_score'->>'grade'
          WHEN 'A' THEN 1
          WHEN 'B' THEN 2
          WHEN 'C' THEN 3
          WHEN 'D' THEN 4
          WHEN 'F' THEN 5
        END
    `, params);
    
    // Engagement metrics
    const engagementStats = await pool.query(`
      SELECT 
        AVG(call_count) as avg_calls_per_lead,
        AVG(message_count) as avg_messages_per_lead,
        AVG(booking_count) as avg_bookings_per_lead
      FROM (
        SELECT 
          leads.id,
          COUNT(DISTINCT cl.id) as call_count,
          COUNT(DISTINCT wm.id) as message_count,
          COUNT(DISTINCT b.id) as booking_count
        FROM leads
        LEFT JOIN call_logs cl ON leads.id = cl.lead_id
        LEFT JOIN whatsapp_messages wm ON leads.id = wm.lead_id
        LEFT JOIN bookings b ON leads.id = b.lead_id
        WHERE leads.company_id = $1 ${dateFilter}
        GROUP BY leads.id
      ) sub
    `, params);
    
    // Task completion stats
    const taskStats = await pool.query(`
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
        COUNT(*) FILTER (WHERE status = 'pending' AND due_date < NOW()) as overdue_tasks,
        AVG(
          EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600
        ) FILTER (WHERE status = 'completed') as avg_completion_hours
      FROM tasks
      WHERE company_id = $1 ${dateFilter}
    `, params);
    
    logRequest('GET', `/api/analytics/leads-complete/${company_id}`, 200);
    res.json({
      success: true,
      data: {
        overall: overallStats.rows[0],
        by_source: sourceStats.rows,
        by_language: languageStats.rows,
        by_score: scoreStats.rows,
        engagement: engagementStats.rows[0],
        tasks: taskStats.rows[0]
      }
    });
    
  } catch (error) {
    console.error('Complete analytics error:', error);
    logRequest('GET', `/api/analytics/leads-complete/${company_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});





// ============================================
// AUTOMATED CALL SUMMARY DELIVERY
// ============================================

/**
 * Generate customer-friendly call summary
 */
async function generateCustomerSummary(call_sid) {
  try {
    const callResult = await pool.query(`
      SELECT 
        cl.*,
        l.name as lead_name,
        l.email,
        l.phone_number,
        l.preferred_language,
        c.name as company_name
      FROM call_logs cl
      JOIN leads l ON cl.lead_id = l.id
      JOIN companies c ON cl.company_id = c.id
      WHERE cl.call_sid = $1
    `, [call_sid]);
    
    if (callResult.rows.length === 0) {
      throw new Error('Call log not found');
    }
    
    const call = callResult.rows[0];
    const summary = call.summary || {};
    const sentiment = call.sentiment || {};
    
    // Generate customer-friendly summary using AI
    const groq = require('groq-sdk');
    const client = new groq.Groq({ apiKey: process.env.GROQ_API_KEY });
    
    const prompt = `
Transform this call summary into a professional, customer-friendly message:

Call Details:
- Duration: ${call.call_duration} seconds
- Sentiment: ${sentiment.sentiment || 'neutral'}
- Intent: ${summary.intent || 'general inquiry'}

AI Summary: ${summary.summary || 'Call completed successfully'}

Create a brief, professional summary (max 200 words) that:
1. Thanks them for their time
2. Highlights key discussion points
3. Mentions next steps if any
4. Maintains a warm, professional tone

Format as plain text, no markdown.
`;
    
    const completion = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 300
    });
    
    const customerSummary = completion.choices[0].message.content.trim();
    
    // Translate if needed
    let finalSummary = customerSummary;
    if (call.preferred_language && call.preferred_language !== 'en') {
      finalSummary = await translateText(customerSummary, call.preferred_language, 'en');
    }
    
    // Store in database
    await pool.query(`
      UPDATE call_logs
      SET summary = jsonb_set(
        COALESCE(summary, '{}'::jsonb),
        '{customer_summary}',
        to_jsonb($1::text)
      )
      WHERE call_sid = $2
    `, [finalSummary, call_sid]);
    
    return {
      summary: finalSummary,
      lead: call,
      company_name: call.company_name
    };
    
  } catch (error) {
    console.error('Generate customer summary error:', error);
    throw error;
  }
}


/**
 * Send call summary via email
 */
async function sendCallSummaryEmail(call_sid) {
  try {
    const summaryData = await generateCustomerSummary(call_sid);
    const { summary, lead, company_name } = summaryData;
    
    if (!lead.email) {
      console.log(`No email available for lead ${lead.id}, skipping email summary`);
      return { success: false, reason: 'No email address' };
    }
    
    // Get company email config
    const emailConfig = await getCompanyEmailConfig(lead.company_id || 1);
    const transporter = await createEmailTransporter(emailConfig);
    
    const emailHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Call Summary</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
    .summary-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
    .footer { text-align: center; margin-top: 30px; color: #6c757d; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📞 Call Summary</h1>
    <p>Thank you for speaking with ${company_name}</p>
  </div>
  <div class="content">
    <p>Dear ${lead.name || 'Valued Customer'},</p>
    
    <div class="summary-box">
      ${summary.split('\n').map(line => `<p>${line}</p>`).join('')}
    </div>
    
    <p>If you have any questions or need further assistance, please don't hesitate to reach out.</p>
    
    <div class="footer">
      <p><strong>${company_name}</strong></p>
      <p>This is an automated summary. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
    `;
    
    const mailOptions = {
      from: `${company_name} <${emailConfig.email_address}>`,
      to: lead.email,
      subject: `Call Summary - ${company_name}`,
      html: emailHTML
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    // Log the email
    await pool.query(`
      INSERT INTO email_queue (to_email, subject, body, lead_id, status, sent_at)
      VALUES ($1, $2, $3, $4, 'sent', NOW())
    `, [lead.email, mailOptions.subject, 'Call summary sent', lead.id]);
    
    console.log(`✅ Call summary email sent to ${lead.email}`);
    return { success: true, message_id: info.messageId };
    
  } catch (error) {
    console.error('Send call summary email error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send call summary via WhatsApp
 */
async function sendCallSummaryWhatsApp(call_sid) {
  try {
    const summaryData = await generateCustomerSummary(call_sid);
    const { summary, lead, company_name } = summaryData;
    
    // Get agent instance for WhatsApp
    const agentResult = await pool.query(`
      SELECT ai.*
      FROM agent_instances ai
      WHERE ai.company_id = $1 
      AND ai.agent_type = 'whatsapp'
      AND ai.is_active = TRUE
      LIMIT 1
    `, [lead.company_id || 1]);
    
    if (agentResult.rows.length === 0) {
      console.log('No WhatsApp agent available for summary delivery');
      return { success: false, reason: 'No WhatsApp agent configured' };
    }
    
    const agent = agentResult.rows[0];
    const credentials = agent.whatsapp_credentials;
    
    if (!credentials.access_token) {
      return { success: false, reason: 'WhatsApp not configured' };
    }
    
    const message = `📞 *Call Summary*\n\n${summary}\n\n_Thank you for speaking with ${company_name}_`;
    
    const response = await axios.post(
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
    
    // Log the message
    await pool.query(`
      INSERT INTO whatsapp_messages 
      (lead_id, phone_number, message_type, message_body, sender, is_from_user, message_id)
      VALUES ($1, $2, 'text', $3, 'bot', FALSE, $4)
    `, [lead.id, lead.phone_number, message, response.data.messages[0].id]);
    
    console.log(`✅ Call summary WhatsApp sent to ${lead.phone_number}`);
    return { success: true, message_id: response.data.messages[0].id };
    
  } catch (error) {
    console.error('Send call summary WhatsApp error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Automatically send summaries after call completion
 */
async function autoSendCallSummaries(call_sid) {
  try {
    const callResult = await pool.query(`
      SELECT l.email, l.phone_number, l.preferred_language, cl.company_id
      FROM call_logs cl
      JOIN leads l ON cl.lead_id = l.id
      WHERE cl.call_sid = $1
    `, [call_sid]);
    
    if (callResult.rows.length === 0) {
      console.log('No lead found for call summary delivery');
      return;
    }
    
    const lead = callResult.rows[0];
    const results = [];
    
    // Send email if available
    if (lead.email) {
      const emailResult = await sendCallSummaryEmail(call_sid);
      results.push({ channel: 'email', ...emailResult });
    }
    
    // Send WhatsApp
    const whatsappResult = await sendCallSummaryWhatsApp(call_sid);
    results.push({ channel: 'whatsapp', ...whatsappResult });
    
    console.log(`📊 Summary delivery results for ${call_sid}:`, results);
    return results;
    
  } catch (error) {
    console.error('Auto send summaries error:', error);
  }
}

// ============================================
// API ENDPOINTS FOR SUMMARY DELIVERY
// ============================================

app.post('/api/call-summaries/send', async (req, res) => {
  try {
    const { call_sid, channels } = req.body;
    
    if (!call_sid) {
      return res.status(400).json({ error: 'call_sid required' });
    }
    
    const results = {};
    
    if (!channels || channels.includes('email')) {
      results.email = await sendCallSummaryEmail(call_sid);
    }
    
    if (!channels || channels.includes('whatsapp')) {
      results.whatsapp = await sendCallSummaryWhatsApp(call_sid);
    }
    
    logRequest('POST', '/api/call-summaries/send', 200);
    res.json({
      success: true,
      call_sid,
      results
    });
    
  } catch (error) {
    console.error('Send call summary error:', error);
    logRequest('POST', '/api/call-summaries/send', 500);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/call-summaries/:call_sid', async (req, res) => {
  try {
    const { call_sid } = req.params;
    
    const result = await pool.query(`
      SELECT 
        cl.call_sid,
        cl.call_duration,
        cl.transcript,
        cl.sentiment,
        cl.summary,
        l.name as lead_name,
        l.email,
        l.phone_number
      FROM call_logs cl
      JOIN leads l ON cl.lead_id = l.id
      WHERE cl.call_sid = $1
    `, [call_sid]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    logRequest('GET', `/api/call-summaries/${call_sid}`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Get call summary error:', error);
    logRequest('GET', `/api/call-summaries/${call_sid}`, 500);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/call-summaries/regenerate', async (req, res) => {
  try {
    const { call_sid } = req.body;
    
    if (!call_sid) {
      return res.status(400).json({ error: 'call_sid required' });
    }
    
    const summaryData = await generateCustomerSummary(call_sid);
    
    logRequest('POST', '/api/call-summaries/regenerate', 200);
    res.json({
      success: true,
      data: summaryData
    });
    
  } catch (error) {
    console.error('Regenerate summary error:', error);
    logRequest('POST', '/api/call-summaries/regenerate', 500);
    res.status(500).json({ error: error.message });
  }
});




// ============================================
// WHATSAPP CHAT SUMMARIZATION
// ============================================

/**
 * Generate summary of WhatsApp conversation
 */
async function summarizeWhatsAppConversation(conversation_id) {
  try {
    const messagesResult = await pool.query(`
      SELECT 
        wm.message_body,
        wm.sender,
        wm.timestamp,
        l.name as lead_name,
        l.preferred_language
      FROM whatsapp_messages wm
      JOIN leads l ON wm.lead_id = l.id
      WHERE wm.conversation_id = $1
      ORDER BY wm.timestamp ASC
    `, [conversation_id]);
    
    if (messagesResult.rows.length === 0) {
      throw new Error('No messages found for this conversation');
    }
    
    const messages = messagesResult.rows;
    const lead_name = messages[0].lead_name;
    const preferred_language = messages[0].preferred_language;
    
    // Format conversation for AI
    const formattedChat = messages.map(msg => 
      `${msg.sender === 'user' ? 'Customer' : 'Agent'}: ${msg.message_body}`
    ).join('\n');
    
    // Generate summary using Groq
    const groq = require('groq-sdk');
    const client = new groq.Groq({ apiKey: process.env.GROQ_API_KEY });
    
    const prompt = `
Analyze this WhatsApp conversation and provide a structured summary:

Conversation:
${formattedChat}

Provide a JSON response with:
{
  "summary": "Brief 2-3 sentence summary",
  "key_points": ["point1", "point2", "point3"],
  "customer_sentiment": "positive/neutral/negative",
  "intent": "inquiry/purchase/support/complaint/other",
  "action_items": ["action1", "action2"],
  "next_steps": "What should happen next"
}

JSON:
`;
    
    const completion = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500
    });
    
    const responseText = completion.choices[0].message.content;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Failed to parse AI summary response');
    }
    
    const summaryData = JSON.parse(jsonMatch[0]);
    
    // Store summary in conversation
    await pool.query(`
      UPDATE conversations
      SET 
        ai_summary = $1,
        sentiment = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [
      summaryData.summary,
      summaryData.customer_sentiment,
      conversation_id
    ]);
    
    return summaryData;
    
  } catch (error) {
    console.error('Summarize WhatsApp conversation error:', error);
    throw error;
  }
}

/**
 * Auto-summarize conversations after N messages
 */
async function autoSummarizeIfNeeded(conversation_id) {
  try {
    const convResult = await pool.query(`
      SELECT 
        c.message_count,
        c.ai_summary,
        c.updated_at
      FROM conversations c
      WHERE c.id = $1
    `, [conversation_id]);
    
    if (convResult.rows.length === 0) return;
    
    const conv = convResult.rows[0];
    
    // Trigger summary every 10 messages or if no summary exists
    const shouldSummarize = 
      !conv.ai_summary || 
      conv.message_count % 10 === 0 ||
      (new Date() - new Date(conv.updated_at)) > 24 * 60 * 60 * 1000; // 24 hours
    
    if (shouldSummarize) {
      console.log(`🤖 Auto-summarizing conversation ${conversation_id}`);
      await summarizeWhatsAppConversation(conversation_id);
    }
    
  } catch (error) {
    console.error('Auto summarize error:', error);
  }
}

// ============================================
// API ENDPOINTS
// ============================================

app.post('/api/whatsapp/summarize', async (req, res) => {
  try {
    const { conversation_id, phone_number } = req.body;
    
    let convId = conversation_id;
    
    // If phone provided instead of ID, find conversation
    if (!convId && phone_number) {
      const convResult = await pool.query(
        'SELECT id FROM conversations WHERE phone_number = $1 LIMIT 1',
        [phone_number]
      );
      
      if (convResult.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      convId = convResult.rows[0].id;
    }
    
    if (!convId) {
      return res.status(400).json({ error: 'conversation_id or phone_number required' });
    }
    
    const summary = await summarizeWhatsAppConversation(convId);
    
    logRequest('POST', '/api/whatsapp/summarize', 200);
    res.json({
      success: true,
      conversation_id: convId,
      summary
    });
    
  } catch (error) {
    console.error('WhatsApp summarize error:', error);
    logRequest('POST', '/api/whatsapp/summarize', 500);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/whatsapp/batch-summarize', async (req, res) => {
  try {
    const { company_id, limit = 50 } = req.body;
    
    // Find conversations needing summarization
    const conversationsResult = await pool.query(`
      SELECT c.id
      FROM conversations c
      JOIN leads l ON c.lead_id = l.id
      WHERE l.company_id = $1
      AND (c.ai_summary IS NULL OR c.message_count % 10 = 0)
      AND c.message_count > 3
      ORDER BY c.updated_at DESC
      LIMIT $2
    `, [company_id, limit]);
    
    const results = [];
    const errors = [];
    
    for (const conv of conversationsResult.rows) {
      try {
        const summary = await summarizeWhatsAppConversation(conv.id);
        results.push({ conversation_id: conv.id, success: true, summary });
      } catch (error) {
        errors.push({ conversation_id: conv.id, error: error.message });
      }
      
      // Rate limit: wait 1 second between summaries
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logRequest('POST', '/api/whatsapp/batch-summarize', 200);
    res.json({
      success: true,
      summarized: results.length,
      failed: errors.length,
      results,
      errors
    });
    
  } catch (error) {
    console.error('Batch summarize error:', error);
    logRequest('POST', '/api/whatsapp/batch-summarize', 500);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/conversations/:phone/summary', async (req, res) => {
  try {
    const { phone } = req.params;
    
    const result = await pool.query(`
      SELECT 
        c.id,
        c.ai_summary,
        c.sentiment,
        c.message_count,
        c.last_message,
        c.updated_at,
        l.name as lead_name
      FROM conversations c
      JOIN leads l ON c.lead_id = l.id
      WHERE c.phone_number = $1
      ORDER BY c.updated_at DESC
      LIMIT 1
    `, [phone]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    logRequest('GET', `/api/conversations/${phone}/summary`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Get conversation summary error:', error);
    logRequest('GET', `/api/conversations/${phone}/summary`, 500);
    res.status(500).json({ error: error.message });
  }
});





// ============================================
// TRANSCRIPT SEARCH (PostgreSQL Full-Text Search)
// ============================================

app.get('/api/transcripts/search', async (req, res) => {
  try {
    const { 
      query, 
      company_id, 
      start_date, 
      end_date,
      sentiment,
      limit = 50 
    } = req.query;
    
    if (!query || query.trim().length < 3) {
      return res.status(400).json({ error: 'Search query must be at least 3 characters' });
    }
    
    let searchQuery = `
      SELECT 
        cl.call_sid,
        cl.transcript,
        cl.call_duration,
        cl.sentiment,
        cl.summary,
        cl.created_at,
        l.name as lead_name,
        l.phone_number,
        l.email,
        ts_rank(to_tsvector('english', cl.transcript), plainto_tsquery('english', $1)) as relevance
      FROM call_logs cl
      JOIN leads l ON cl.lead_id = l.id
      WHERE to_tsvector('english', cl.transcript) @@ plainto_tsquery('english', $1)
      AND cl.transcript IS NOT NULL
    `;
    
    const params = [query];
    let paramCount = 1;
    
    if (company_id) {
      paramCount++;
      searchQuery += ` AND cl.company_id = $${paramCount}`;
      params.push(parseInt(company_id));
    }
    
    if (start_date) {
      paramCount++;
      searchQuery += ` AND cl.created_at >= $${paramCount}`;
      params.push(start_date);
    }
    
    if (end_date) {
      paramCount++;
      searchQuery += ` AND cl.created_at <= $${paramCount}`;
      params.push(end_date);
    }
    
    if (sentiment) {
      paramCount++;
      searchQuery += ` AND cl.sentiment->>'sentiment' = $${paramCount}`;
      params.push(sentiment);
    }
    
    searchQuery += ` ORDER BY relevance DESC, cl.created_at DESC`;
    
    paramCount++;
    searchQuery += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(searchQuery, params);
    
    // Highlight search terms in results
    const highlightedResults = result.rows.map(row => ({
      ...row,
      transcript_excerpt: extractRelevantExcerpt(row.transcript, query),
      relevance_score: parseFloat(row.relevance).toFixed(4)
    }));
    
    logRequest('GET', '/api/transcripts/search', 200);
    res.json({
      success: true,
      query,
      count: highlightedResults.length,
      results: highlightedResults
    });
    
  } catch (error) {
    console.error('Transcript search error:', error);
    logRequest('GET', '/api/transcripts/search', 500);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/whatsapp/search', async (req, res) => {
  try {
    const { 
      query, 
      company_id, 
      start_date, 
      end_date,
      limit = 50 
    } = req.query;
    
    if (!query || query.trim().length < 3) {
      return res.status(400).json({ error: 'Search query must be at least 3 characters' });
    }
    
    let searchQuery = `
      SELECT 
        wm.id,
        wm.message_body,
        wm.sender,
        wm.timestamp,
        l.name as lead_name,
        l.phone_number,
        l.email,
        c.ai_summary,
        ts_rank(to_tsvector('english', wm.message_body), plainto_tsquery('english', $1)) as relevance
      FROM whatsapp_messages wm
      JOIN leads l ON wm.lead_id = l.id
      JOIN conversations c ON wm.conversation_id = c.id
      WHERE to_tsvector('english', wm.message_body) @@ plainto_tsquery('english', $1)
    `;
    
    const params = [query];
    let paramCount = 1;
    
    if (company_id) {
      paramCount++;
      searchQuery += ` AND l.company_id = $${paramCount}`;
      params.push(parseInt(company_id));
    }
    
    if (start_date) {
      paramCount++;
      searchQuery += ` AND wm.timestamp >= $${paramCount}`;
      params.push(start_date);
    }
    
    if (end_date) {
      paramCount++;
      searchQuery += ` AND wm.timestamp <= $${paramCount}`;
      params.push(end_date);
    }
    
    searchQuery += ` ORDER BY relevance DESC, wm.timestamp DESC`;
    
    paramCount++;
    searchQuery += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(searchQuery, params);
    
    // Highlight search terms
    const highlightedResults = result.rows.map(row => ({
      ...row,
      message_excerpt: extractRelevantExcerpt(row.message_body, query),
      relevance_score: parseFloat(row.relevance).toFixed(4)
    }));
    
    logRequest('GET', '/api/whatsapp/search', 200);
    res.json({
      success: true,
      query,
      count: highlightedResults.length,
      results: highlightedResults
    });
    
  } catch (error) {
    console.error('WhatsApp search error:', error);
    logRequest('GET', '/api/whatsapp/search', 500);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Extract relevant excerpt around search term
 */
function extractRelevantExcerpt(text, query, contextLength = 150) {
  if (!text) return '';
  
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  
  if (index === -1) {
    return text.substring(0, contextLength) + '...';
  }
  
  const start = Math.max(0, index - Math.floor(contextLength / 2));
  const end = Math.min(text.length, index + query.length + Math.floor(contextLength / 2));
  
  let excerpt = text.substring(start, end);
  
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt = excerpt + '...';
  
  // Highlight the search term
  const regex = new RegExp(`(${query})`, 'gi');
  excerpt = excerpt.replace(regex, '**$1**');
  
  return excerpt;
}

app.get('/api/search/combined', async (req, res) => {
  try {
    const { query, company_id, limit = 20 } = req.query;
    
    if (!query || query.trim().length < 3) {
      return res.status(400).json({ error: 'Search query must be at least 3 characters' });
    }
    
    // Search both call transcripts and WhatsApp messages
    const [transcriptResults, whatsappResults] = await Promise.all([
      axios.get(`${process.env.BASE_URL}/api/transcripts/search`, {
        params: { query, company_id, limit }
      }),
      axios.get(`${process.env.BASE_URL}/api/whatsapp/search`, {
        params: { query, company_id, limit }
      })
    ]);
    
    logRequest('GET', '/api/search/combined', 200);
    res.json({
      success: true,
      query,
      results: {
        call_transcripts: transcriptResults.data.results || [],
        whatsapp_messages: whatsappResults.data.results || [],
        total_count: 
          (transcriptResults.data.count || 0) + 
          (whatsappResults.data.count || 0)
      }
    });
    
  } catch (error) {
    console.error('Combined search error:', error);
    logRequest('GET', '/api/search/combined', 500);
    res.status(500).json({ error: error.message });
  }
});



// ============================================
// MODULE 7: DRIP CAMPAIGN ENDPOINTS
// ============================================

/**
 * Create a new drip campaign
 */
app.post('/api/drip-campaigns', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      company_id,
      campaign_name,
      description,
      trigger_type,
      trigger_conditions,
      steps
    } = req.body;
    
    if (!company_id || !campaign_name || !trigger_type) {
      return res.status(400).json({
        error: 'company_id, campaign_name, and trigger_type are required'
      });
    }
    
    const campaignResult = await client.query(`
      INSERT INTO drip_campaigns (
        company_id, campaign_name, description,
        trigger_type, trigger_conditions, is_active
      )
      VALUES ($1, $2, $3, $4, $5, FALSE)
      RETURNING *
    `, [
      company_id,
      campaign_name,
      description || null,
      trigger_type,
      JSON.stringify(trigger_conditions || {})
    ]);
    
    const campaign_id = campaignResult.rows[0].id;
    
    if (steps && Array.isArray(steps)) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await client.query(`
          INSERT INTO drip_campaign_steps (
            campaign_id, step_number, step_type,
            delay_days, delay_hours, delay_minutes,
            subject, message_body, template_id,
            send_conditions, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
        `, [
          campaign_id,
          i + 1,
          step.step_type,
          step.delay_days || 0,
          step.delay_hours || 0,
          step.delay_minutes || 0,
          step.subject || null,
          step.message_body || null,
          step.template_id || null,
          JSON.stringify(step.send_conditions || {})
        ]);
      }
    }
    
    await client.query('COMMIT');
    
    logRequest('POST', '/api/drip-campaigns', 201);
    res.status(201).json({
      success: true,
      data: campaignResult.rows[0],
      message: 'Drip campaign created successfully'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create drip campaign error:', error);
    logRequest('POST', '/api/drip-campaigns', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    client.release();
  }
});



/**
 * Get all drip campaigns for a company
 */
app.get('/api/drip-campaigns/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    const { is_active } = req.query;
    
    let query = `
      SELECT 
        dc.*,
        COUNT(DISTINCT dcs.id) as total_steps,
        COUNT(DISTINCT dcsu.id) FILTER (WHERE dcsu.status = 'active') as active_subscribers,
        COUNT(DISTINCT dcsu.id) FILTER (WHERE dcsu.status = 'completed') as completed_subscribers
      FROM drip_campaigns dc
      LEFT JOIN drip_campaign_steps dcs ON dc.id = dcs.campaign_id
      LEFT JOIN drip_campaign_subscribers dcsu ON dc.id = dcsu.campaign_id
      WHERE dc.company_id = $1
    `;
    
    const params = [company_id];
    
    if (is_active !== undefined) {
      params.push(is_active === 'true');
      query += ` AND dc.is_active = $${params.length}`;
    }
    
    query += `
      GROUP BY dc.id
      ORDER BY dc.created_at DESC
    `;
    
    const result = await pool.query(query, params);
    
    logRequest('GET', `/api/drip-campaigns/${company_id}`, 200);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get drip campaigns error:', error);
    logRequest('GET', `/api/drip-campaigns/${company_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});




/**
 * Get all subscribers of a campaign
 */
app.get('/api/drip-campaigns/subscribers/:campaign_id', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { status } = req.query;
    
    let query = `
      SELECT 
        dcs.*,
        l.name as lead_name,
        l.email,
        l.phone_number,
        l.lead_status
      FROM drip_campaign_subscribers dcs
      JOIN leads l ON dcs.lead_id = l.id
      WHERE dcs.campaign_id = $1
    `;
    
    const params = [campaign_id];
    
    if (status) {
      params.push(status);
      query += ` AND dcs.status = $${params.length}`;
    }
    
    query += ' ORDER BY dcs.created_at DESC';
    
    const result = await pool.query(query, params);
    
    logRequest('GET', `/api/drip-campaigns/subscribers/${campaign_id}`, 200);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get campaign subscribers error:', error);
    logRequest('GET', `/api/drip-campaigns/subscribers/${req.params.campaign_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



/**
 * Get execution history of a lead
 */
app.get('/api/drip-campaigns/executions/:lead_id', async (req, res) => {
  try {
    const { lead_id } = req.params;
    const { campaign_id } = req.query;
    
    let query = `
      SELECT 
        dse.*,
        dcs.step_type,
        dcs.step_number,
        dcs.subject,
        dc.campaign_name,
        l.name as lead_name
      FROM drip_step_executions dse
      JOIN drip_campaign_steps dcs ON dse.step_id = dcs.id
      JOIN drip_campaign_subscribers dcsu ON dse.subscriber_id = dcsu.id
      JOIN drip_campaigns dc ON dcsu.campaign_id = dc.id
      JOIN leads l ON dse.lead_id = l.id
      WHERE dse.lead_id = $1
    `;
    
    const params = [lead_id];
    
    if (campaign_id) {
      params.push(campaign_id);
      query += ` AND dcsu.campaign_id = $${params.length}`;
    }
    
    query += ' ORDER BY dse.created_at DESC';
    
    const result = await pool.query(query, params);
    
    logRequest('GET', `/api/drip-campaigns/executions/${lead_id}`, 200);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get execution history error:', error);
    logRequest('GET', `/api/drip-campaigns/executions/${req.params.lead_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



/**
 * Get campaign details with steps
 */
app.get('/api/drip-campaigns/:company_id/:campaign_id', async (req, res) => {
  try {
    const { company_id, campaign_id } = req.params;
    
    const campaignResult = await pool.query(`
      SELECT * FROM drip_campaigns
      WHERE id = $1 AND company_id = $2
    `, [campaign_id, company_id]);
    
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const stepsResult = await pool.query(`
      SELECT * FROM drip_campaign_steps
      WHERE campaign_id = $1
      ORDER BY step_number ASC
    `, [campaign_id]);
    
    logRequest('GET', `/api/drip-campaigns/${company_id}/${campaign_id}`, 200);
    res.json({
      success: true,
      data: {
        ...campaignResult.rows[0],
        steps: stepsResult.rows
      }
    });
    
  } catch (error) {
    console.error('Get campaign details error:', error);
    logRequest('GET', `/api/drip-campaigns/${company_id}/${campaign_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});





/**
 * Update drip campaign
 */
app.patch('/api/drip-campaigns/:campaign_id', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { campaign_name, description, is_active, trigger_conditions } = req.body;
    
    const updates = [];
    const params = [];
    let paramCount = 0;
    
    if (campaign_name) {
      paramCount++;
      updates.push(`campaign_name = $${paramCount}`);
      params.push(campaign_name);
    }
    
    if (description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      params.push(description);
    }
    
    if (is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      params.push(is_active);
    }
    
    if (trigger_conditions) {
      paramCount++;
      updates.push(`trigger_conditions = $${paramCount}`);
      params.push(JSON.stringify(trigger_conditions));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(campaign_id);
    
    const query = `
      UPDATE drip_campaigns
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    logRequest('PATCH', `/api/drip-campaigns/${campaign_id}`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Update campaign error:', error);
    logRequest('PATCH', `/api/drip-campaigns/${campaign_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



/**
 * Subscribe a lead to a drip campaign
 */
app.post('/api/drip-campaigns/subscribe', async (req, res) => {
  try {
    const { campaign_id, lead_id } = req.body;
    
    if (!campaign_id || !lead_id) {
      return res.status(400).json({
        error: 'campaign_id and lead_id are required'
      });
    }
    
    const existingResult = await pool.query(`
      SELECT * FROM drip_campaign_subscribers
      WHERE campaign_id = $1 AND lead_id = $2
    `, [campaign_id, lead_id]);
    
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      
      if (existing.status === 'unsubscribed') {
        return res.status(400).json({
          error: 'Lead has unsubscribed from this campaign'
        });
      }
      
      return res.status(400).json({
        error: 'Lead is already subscribed to this campaign'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO drip_campaign_subscribers (
        campaign_id, lead_id, current_step, status, started_at
      )
      VALUES ($1, $2, 0, 'active', NOW())
      RETURNING *
    `, [campaign_id, lead_id]);
    
    await pool.query(`
      UPDATE drip_campaigns
      SET total_subscribers = total_subscribers + 1
      WHERE id = $1
    `, [campaign_id]);
    
    await scheduleNextDripStep(result.rows[0].id);
    
    logRequest('POST', '/api/drip-campaigns/subscribe', 201);
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Lead subscribed to campaign successfully'
    });
    
  } catch (error) {
    console.error('Subscribe to campaign error:', error);
    logRequest('POST', '/api/drip-campaigns/subscribe', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});





/**
 * Unsubscribe a lead from campaigns
 */
app.post('/api/drip-campaigns/unsubscribe', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      lead_id,
      company_id,
      unsubscribe_type = 'all',
      campaign_id,
      reason,
      ip_address,
      user_agent
    } = req.body;
    
    if (!lead_id) {
      return res.status(400).json({
        error: 'lead_id is required'
      });
    }
    
    // Get company_id from lead if not provided
    let finalCompanyId = company_id;
    if (!finalCompanyId && lead_id) {
      const leadResult = await client.query(
        'SELECT company_id FROM leads WHERE id = $1',
        [lead_id]
      );
      if (leadResult.rows.length > 0) {
        finalCompanyId = leadResult.rows[0].company_id;
      }
    }
    
    if (!finalCompanyId) {
      return res.status(400).json({
        error: 'company_id could not be determined. Please provide company_id or valid lead_id'
      });
    }
    
    await client.query(`
      INSERT INTO unsubscribes (
        lead_id, company_id, unsubscribe_type,
        campaign_id, reason, ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (lead_id, unsubscribe_type, campaign_id) DO UPDATE
      SET unsubscribed_at = NOW(), reason = EXCLUDED.reason
    `, [
      lead_id,
      finalCompanyId,
      unsubscribe_type,
      campaign_id || null,
      reason || null,
      ip_address || null,
      user_agent || null
    ]);
    
    if (campaign_id) {
      await client.query(`
        UPDATE drip_campaign_subscribers
        SET status = 'unsubscribed', unsubscribed_at = NOW()
        WHERE lead_id = $1 AND campaign_id = $2
      `, [lead_id, campaign_id]);
    } else if (unsubscribe_type === 'all') {
      await client.query(`
        UPDATE drip_campaign_subscribers
        SET status = 'unsubscribed', unsubscribed_at = NOW()
        WHERE lead_id = $1
      `, [lead_id]);
    }
    
    await client.query(`
      UPDATE drip_step_executions dse
      SET status = 'skipped', error_message = 'Lead unsubscribed'
      FROM drip_campaign_subscribers dcs
      WHERE dse.subscriber_id = dcs.id
      AND dcs.lead_id = $1
      AND dse.status = 'pending'
      ${campaign_id ? 'AND dcs.campaign_id = $2' : ''}
    `, campaign_id ? [lead_id, campaign_id] : [lead_id]);
    
    await client.query('COMMIT');
    
    logRequest('POST', '/api/drip-campaigns/unsubscribe', 200);
    res.json({
      success: true,
      message: 'Unsubscribed successfully'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Unsubscribe error:', error);
    logRequest('POST', '/api/drip-campaigns/unsubscribe', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    client.release();
  }
});





/**
 * Get campaign performance metrics
 */
app.get('/api/drip-campaigns/:campaign_id/performance', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    const params = [campaign_id];
    
    if (start_date && end_date) {
      params.push(start_date, end_date);
      dateFilter = ` AND date BETWEEN $2 AND $3`;
    }
    
    const performanceResult = await pool.query(`
      SELECT 
        SUM(messages_sent) as total_sent,
        SUM(messages_delivered) as total_delivered,
        SUM(messages_opened) as total_opened,
        SUM(messages_clicked) as total_clicked,
        SUM(messages_failed) as total_failed,
        SUM(unsubscribes) as total_unsubscribes,
        SUM(leads_converted) as total_conversions,
        SUM(revenue_generated) as total_revenue,
        SUM(total_cost) as total_cost,
        CASE 
          WHEN SUM(messages_sent) > 0 
          THEN (SUM(messages_delivered)::float / SUM(messages_sent) * 100)
          ELSE 0 
        END as delivery_rate,
        CASE 
          WHEN SUM(messages_delivered) > 0 
          THEN (SUM(messages_opened)::float / SUM(messages_delivered) * 100)
          ELSE 0 
        END as open_rate,
        CASE 
          WHEN SUM(messages_opened) > 0 
          THEN (SUM(messages_clicked)::float / SUM(messages_opened) * 100)
          ELSE 0 
        END as click_rate,
        CASE 
          WHEN SUM(messages_sent) > 0 
          THEN (SUM(leads_converted)::float / SUM(messages_sent) * 100)
          ELSE 0 
        END as conversion_rate,
        CASE 
          WHEN SUM(total_cost) > 0 
          THEN (SUM(revenue_generated) - SUM(total_cost))
          ELSE 0 
        END as net_profit,
        CASE 
          WHEN SUM(total_cost) > 0 
          THEN ((SUM(revenue_generated) - SUM(total_cost)) / SUM(total_cost) * 100)
          ELSE 0 
        END as roi
      FROM campaign_performance
      WHERE campaign_id = $1 ${dateFilter}
    `, params);
    
    const subscriberStats = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM drip_campaign_subscribers
      WHERE campaign_id = $1
      GROUP BY status
    `, [campaign_id]);
    
    const stepPerformance = await pool.query(`
      SELECT 
        dcs.step_number,
        dcs.step_type,
        COUNT(dse.id) as total_executions,
        COUNT(dse.id) FILTER (WHERE dse.status = 'sent') as sent,
        COUNT(dse.id) FILTER (WHERE dse.status = 'failed') as failed,
        COUNT(dse.id) FILTER (WHERE dse.opened_at IS NOT NULL) as opened,
        COUNT(dse.id) FILTER (WHERE dse.clicked_at IS NOT NULL) as clicked
      FROM drip_campaign_steps dcs
      LEFT JOIN drip_step_executions dse ON dcs.id = dse.step_id
      WHERE dcs.campaign_id = $1
      GROUP BY dcs.id, dcs.step_number, dcs.step_type
      ORDER BY dcs.step_number
    `, [campaign_id]);
    
    logRequest('GET', `/api/drip-campaigns/${campaign_id}/performance`, 200);
    res.json({
      success: true,
      data: {
        overall_metrics: performanceResult.rows[0],
        subscriber_stats: subscriberStats.rows,
        step_performance: stepPerformance.rows
      }
    });
    
  } catch (error) {
    console.error('Get campaign performance error:', error);
    logRequest('GET', `/api/drip-campaigns/${campaign_id}/performance`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});





// ============================================
// DRIP CAMPAIGN HELPER FUNCTIONS
// ============================================

async function scheduleNextDripStep(subscriber_id) {
  try {
    const subscriberResult = await pool.query(`
      SELECT 
        dcs.*,
        dc.campaign_name,
        l.id as lead_id,
        l.phone_number,
        l.email,
        l.preferred_language,
        l.company_id
      FROM drip_campaign_subscribers dcs
      JOIN drip_campaigns dc ON dcs.campaign_id = dc.id
      JOIN leads l ON dcs.lead_id = l.id
      WHERE dcs.id = $1 AND dcs.status = 'active'
    `, [subscriber_id]);
    
    if (subscriberResult.rows.length === 0) {
      return;
    }
    
    const subscriber = subscriberResult.rows[0];
    const next_step_number = subscriber.current_step + 1;
    
    const stepResult = await pool.query(`
      SELECT * FROM drip_campaign_steps
      WHERE campaign_id = $1 AND step_number = $2 AND is_active = TRUE
    `, [subscriber.campaign_id, next_step_number]);
    
    if (stepResult.rows.length === 0) {
      await pool.query(`
        UPDATE drip_campaign_subscribers
        SET status = 'completed', completed_at = NOW(), current_step = $1
        WHERE id = $2
      `, [next_step_number - 1, subscriber_id]);
      
      await pool.query(`
        UPDATE drip_campaigns
        SET total_completed = total_completed + 1
        WHERE id = $1
      `, [subscriber.campaign_id]);
      
      return;
    }
    
    const step = stepResult.rows[0];
    
    const delay_minutes = 
      (step.delay_days * 24 * 60) + 
      (step.delay_hours * 60) + 
      step.delay_minutes;
    
    const scheduled_for = new Date(Date.now() + delay_minutes * 60 * 1000);
    
    await pool.query(`
      INSERT INTO drip_step_executions (
        subscriber_id, step_id, lead_id,
        status, scheduled_for
      )
      VALUES ($1, $2, $3, 'pending', $4)
    `, [subscriber_id, step.id, subscriber.lead_id, scheduled_for]);
    
    await pool.query(`
      UPDATE drip_campaign_subscribers
      SET current_step = $1
      WHERE id = $2
    `, [next_step_number, subscriber_id]);
    
    console.log(`✅ Scheduled step ${next_step_number} for subscriber ${subscriber_id}`);
    
  } catch (error) {
    console.error('Schedule next step error:', error);
    throw error;
  }
}

async function executePendingDripSteps() {
  try {
    const pendingResult = await pool.query(`
      SELECT 
        dse.*,
        dcs.step_type,
        dcs.subject,
        dcs.message_body,
        dcs.template_id,
        dcsu.campaign_id,
        l.phone_number,
        l.email,
        l.name as lead_name,
        l.preferred_language,
        l.company_id
      FROM drip_step_executions dse
      JOIN drip_campaign_steps dcs ON dse.step_id = dcs.id
      JOIN drip_campaign_subscribers dcsu ON dse.subscriber_id = dcsu.id
      JOIN leads l ON dse.lead_id = l.id
      WHERE dse.status = 'pending'
      AND dse.scheduled_for <= NOW()
      AND dcsu.status = 'active'
      LIMIT 100
    `);
    
    for (const execution of pendingResult.rows) {
      try {
        let sent = false;
        
        switch (execution.step_type) {
          case 'email':
            if (execution.email) {
              sent = await sendDripEmail(execution);
            }
            break;
            
          case 'whatsapp':
            if (execution.phone_number) {
              sent = await sendDripWhatsApp(execution);
            }
            break;
            
          case 'wait':
            sent = true;
            break;
            
          case 'task':
            sent = await createDripTask(execution);
            break;
        }
        
        if (sent) {
          await pool.query(`
            UPDATE drip_step_executions
            SET status = 'sent', sent_at = NOW()
            WHERE id = $1
          `, [execution.id]);
          
          await pool.query(`
            UPDATE drip_campaign_subscribers
            SET last_step_sent_at = NOW()
            WHERE id = $1
          `, [execution.subscriber_id]);
          
          await scheduleNextDripStep(execution.subscriber_id);
          
          await updateCampaignPerformance(execution.campaign_id, 'messages_sent');
        }
        
      } catch (error) {
        console.error(`Execution ${execution.id} failed:`, error);
        
        await pool.query(`
          UPDATE drip_step_executions
          SET status = 'failed', error_message = $1
          WHERE id = $2
        `, [error.message, execution.id]);
      }
    }
    
    if (pendingResult.rows.length > 0) {
      console.log(`✅ Executed ${pendingResult.rows.length} drip steps`);
    }
    
  } catch (error) {
    console.error('Execute pending drip steps error:', error);
  }
}





async function sendDripEmail(execution) {
  try {
    const emailConfig = await getCompanyEmailConfig(execution.company_id);
    const transporter = await createEmailTransporter(emailConfig);
    
    let message = execution.message_body;
    if (execution.preferred_language !== 'en') {
      message = await translateText(message, execution.preferred_language, 'en');
    }
    
    const mailOptions = {
      from: emailConfig.email_address,
      to: execution.email,
      subject: execution.subject,
      html: message
    };
    
    await transporter.sendMail(mailOptions);
    
    await pool.query(`
      INSERT INTO email_queue (
        to_email, subject, body, lead_id, status, sent_at
      )
      VALUES ($1, $2, $3, $4, 'sent', NOW())
    `, [execution.email, execution.subject, 'Drip email sent', execution.lead_id]);
    
    return true;
  } catch (error) {
    console.error('Send drip email error:', error);
    return false;
  }
}




async function sendDripWhatsApp(execution) {
  try {
    const agentResult = await pool.query(`
      SELECT ai.* FROM agent_instances ai
      WHERE ai.company_id = $1 
      AND ai.agent_type = 'whatsapp'
      AND ai.is_active = TRUE
      LIMIT 1
    `, [execution.company_id]);
    
    if (agentResult.rows.length === 0) {
      throw new Error('No WhatsApp agent configured');
    }
    
    const agent = agentResult.rows[0];
    const credentials = agent.whatsapp_credentials;
    
    let message = execution.message_body;
    if (execution.preferred_language !== 'en') {
      message = await translateText(message, execution.preferred_language, 'en');
    }
    
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
      {
        messaging_product: 'whatsapp',
        to: execution.phone_number.replace('+', ''),
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
      INSERT INTO whatsapp_messages 
      (lead_id, phone_number, message_type, message_body, sender, is_from_user, message_id)
      VALUES ($1, $2, 'text', $3, 'bot', FALSE, $4)
    `, [execution.lead_id, execution.phone_number, message, response.data.messages[0].id]);
    
    return true;
  } catch (error) {
    console.error('Send drip WhatsApp error:', error);
    return false;
  }
}


async function createDripTask(execution) {
  try {
    await pool.query(`
      INSERT INTO tasks (
        company_id, lead_id, task_type, title,
        description, due_date, priority, status
      )
      VALUES ($1, $2, 'follow_up', $3, $4, $5, 'medium', 'pending')
    `, [
      execution.company_id,
      execution.lead_id,
      `Drip Campaign Task: ${execution.subject || 'Follow up'}`,
      execution.message_body,
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    ]);
    
    return true;
  } catch (error) {
    console.error('Create drip task error:', error);
    return false;
  }
}

async function updateCampaignPerformance(campaign_id, metric, increment = 1) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    await pool.query(`
      INSERT INTO campaign_performance (campaign_id, date, ${metric})
      VALUES ($1, $2, $3)
      ON CONFLICT (campaign_id, date) DO UPDATE
      SET ${metric} = campaign_performance.${metric} + $3
    `, [campaign_id, today, increment]);
    
  } catch (error) {
    console.error('Update campaign performance error:', error);
  }
}





// ============================================
// MODULE 8: ADVANCED REPORTING ENDPOINTS
// ============================================

/**
 * Get comprehensive agent performance report
 */
app.get('/api/reports/agent-performance', async (req, res) => {
  try {
    const { company_id, start_date, end_date, agent_id } = req.query;
    
    let dateFilter = '';
    const params = [];
    let paramCount = 0;
    
    if (company_id) {
      paramCount++;
      params.push(company_id);
    }
    
    if (start_date && end_date) {
      paramCount += 2;
      params.push(start_date, end_date);
      dateFilter = ` AND l.created_at BETWEEN $${paramCount - 1} AND $${paramCount}`;
    }
    
    let agentFilter = '';
    if (agent_id) {
      paramCount++;
      params.push(agent_id);
      agentFilter = ` AND ha.id = $${paramCount}`;
    }
    
    const query = `
      SELECT 
        ha.id as agent_id,
        ha.name as agent_name,
        ha.email as agent_email,
        ha.role as agent_role,
        
        -- Lead Metrics
        COUNT(DISTINCT l.id) as total_leads_assigned,
        COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'qualified') as qualified_leads,
        COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_won') as won_deals,
        COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_lost') as lost_deals,
        AVG(l.interest_level) as avg_lead_interest,
        
        -- Call Metrics
        COUNT(DISTINCT cl.id) as total_calls,
        COUNT(DISTINCT cl.id) FILTER (WHERE cl.call_status = 'completed') as completed_calls,
        AVG(cl.call_duration) FILTER (WHERE cl.call_status = 'completed') as avg_call_duration,
        COUNT(DISTINCT cl.id) FILTER (WHERE cl.sentiment->>'sentiment' = 'positive') as positive_sentiment_calls,
        
        -- Task Metrics
        COUNT(DISTINCT t.id) as total_tasks,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pending' AND t.due_date < NOW()) as overdue_tasks,
        AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 3600) 
          FILTER (WHERE t.status = 'completed') as avg_task_completion_hours,
        
        -- Revenue Metrics
        SUM(i.amount) FILTER (WHERE i.status = 'paid') as total_revenue,
        COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'paid') as paid_invoices,
        
        -- Conversion Rates
        CASE 
          WHEN COUNT(DISTINCT l.id) > 0 
          THEN (COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_won')::float / COUNT(DISTINCT l.id) * 100)
          ELSE 0 
        END as win_rate,
        
        CASE 
          WHEN COUNT(DISTINCT cl.id) > 0 
          THEN (COUNT(DISTINCT cl.id) FILTER (WHERE cl.call_status = 'completed')::float / COUNT(DISTINCT cl.id) * 100)
          ELSE 0 
        END as call_completion_rate,
        
        CASE 
          WHEN COUNT(DISTINCT t.id) > 0 
          THEN (COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed')::float / COUNT(DISTINCT t.id) * 100)
          ELSE 0 
        END as task_completion_rate
        
      FROM human_agents ha
      LEFT JOIN leads l ON l.assigned_to_agent = ha.name ${company_id ? 'AND l.company_id = $1' : ''} ${dateFilter}
      LEFT JOIN call_logs cl ON l.id = cl.lead_id
      LEFT JOIN tasks t ON t.assigned_to_agent_id = ha.id
      LEFT JOIN invoices i ON l.id = i.lead_id
      WHERE 1=1 ${agentFilter}
      GROUP BY ha.id, ha.name, ha.email, ha.role
      ORDER BY total_revenue DESC, won_deals DESC
    `;
    
    const result = await pool.query(query, params);
    
    logRequest('GET', '/api/reports/agent-performance', 200);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Agent performance report error:', error);
    logRequest('GET', '/api/reports/agent-performance', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});




/**
 * Get revenue forecasting report
 */
app.get('/api/reports/revenue-forecast', async (req, res) => {
  try {
    const { company_id, months = 3 } = req.query;
    
    if (!company_id) {
      return res.status(400).json({ error: 'company_id is required' });
    }
    
    // Historical revenue data
    const historicalResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', i.created_at) as month,
        SUM(i.amount) FILTER (WHERE i.status = 'paid') as revenue,
        COUNT(DISTINCT i.lead_id) FILTER (WHERE i.status = 'paid') as customers,
        AVG(i.amount) FILTER (WHERE i.status = 'paid') as avg_deal_size,
        COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'new') as new_leads
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      WHERE l.company_id = $1
      AND i.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', i.created_at)
      ORDER BY month DESC
    `, [company_id]);
    
    // Current pipeline value
    const pipelineResult = await pool.query(`
      SELECT 
        l.lead_status,
        COUNT(*) as count,
        SUM(COALESCE((l.metadata->>'expected_value')::numeric, 1000)) as pipeline_value
      FROM leads l
      WHERE l.company_id = $1
      AND l.lead_status NOT IN ('closed_won', 'closed_lost')
      GROUP BY l.lead_status
    `, [company_id]);
    
    // Calculate metrics for forecasting
    const recentMonths = historicalResult.rows.slice(0, 6);
    const avgMonthlyRevenue = recentMonths.reduce((sum, row) => sum + parseFloat(row.revenue || 0), 0) / recentMonths.length;
    const avgMonthlyGrowth = recentMonths.length > 1 
      ? ((parseFloat(recentMonths[0].revenue) - parseFloat(recentMonths[recentMonths.length - 1].revenue)) / parseFloat(recentMonths[recentMonths.length - 1].revenue)) / recentMonths.length
      : 0.05;
    
    // Generate forecast
    const forecast = [];
    let forecastRevenue = avgMonthlyRevenue;
    
    for (let i = 0; i < parseInt(months); i++) {
      const forecastDate = new Date();
      forecastDate.setMonth(forecastDate.getMonth() + i + 1);
      
      forecastRevenue *= (1 + avgMonthlyGrowth);
      
      forecast.push({
        month: forecastDate.toISOString().split('T')[0].substring(0, 7),
        forecasted_revenue: Math.round(forecastRevenue * 100) / 100,
        confidence: Math.max(0.5, 1 - (i * 0.1)) // Confidence decreases over time
      });
    }
    
    logRequest('GET', '/api/reports/revenue-forecast', 200);
    res.json({
      success: true,
      data: {
        historical_data: historicalResult.rows,
        current_pipeline: pipelineResult.rows,
        forecast: forecast,
        metrics: {
          avg_monthly_revenue: Math.round(avgMonthlyRevenue * 100) / 100,
          avg_growth_rate: Math.round(avgMonthlyGrowth * 10000) / 100,
          total_pipeline_value: pipelineResult.rows.reduce((sum, row) => sum + parseFloat(row.pipeline_value || 0), 0)
        }
      }
    });
    
  } catch (error) {
    console.error('Revenue forecast error:', error);
    logRequest('GET', '/api/reports/revenue-forecast', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



/**
 * Get churn prediction report
 */
app.get('/api/reports/churn-prediction', async (req, res) => {
  try {
    const { company_id } = req.query;
    
    if (!company_id) {
      return res.status(400).json({ error: 'company_id is required' });
    }
    
    // Identify at-risk customers
    const atRiskResult = await pool.query(`
      SELECT 
        l.id,
        l.name,
        l.phone_number,
        l.email,
        l.lead_status,
        l.interest_level,
        
        -- Engagement metrics
        EXTRACT(DAY FROM (NOW() - l.last_contacted)) as days_since_contact,
        COUNT(DISTINCT cl.id) as total_calls,
        COUNT(DISTINCT wm.id) as total_messages,
        MAX(cl.created_at) as last_call_date,
        MAX(wm.timestamp) as last_message_date,
        
        -- Revenue metrics
        COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'paid') as paid_invoices,
        COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'overdue') as overdue_invoices,
        SUM(i.amount) FILTER (WHERE i.status = 'overdue') as overdue_amount,
        
        -- Churn risk score calculation
        CASE
          WHEN EXTRACT(DAY FROM (NOW() - l.last_contacted)) > 30 THEN 40
          WHEN EXTRACT(DAY FROM (NOW() - l.last_contacted)) > 14 THEN 20
          ELSE 0
        END +
        CASE
          WHEN l.interest_level < 3 THEN 30
          WHEN l.interest_level < 5 THEN 15
          ELSE 0
        END +
        CASE
          WHEN COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'overdue') > 0 THEN 30
          ELSE 0
        END as churn_risk_score
        
      FROM leads l
      LEFT JOIN call_logs cl ON l.id = cl.lead_id
      LEFT JOIN whatsapp_messages wm ON l.id = wm.lead_id
      LEFT JOIN invoices i ON l.id = i.lead_id
      WHERE l.company_id = $1
      AND l.lead_status NOT IN ('closed_lost')
      GROUP BY l.id
      HAVING 
        EXTRACT(DAY FROM (NOW() - l.last_contacted)) > 14 
        OR l.interest_level < 5
        OR COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'overdue') > 0
      ORDER BY 
        CASE
          WHEN EXTRACT(DAY FROM (NOW() - l.last_contacted)) > 30 THEN 40
          WHEN EXTRACT(DAY FROM (NOW() - l.last_contacted)) > 14 THEN 20
          ELSE 0
        END +
        CASE
          WHEN l.interest_level < 3 THEN 30
          WHEN l.interest_level < 5 THEN 15
          ELSE 0
        END +
        CASE
          WHEN COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'overdue') > 0 THEN 30
          ELSE 0
        END DESC
    `, [company_id]);
    
    // Categorize by risk level
    const highRisk = atRiskResult.rows.filter(r => r.churn_risk_score >= 60);
    const mediumRisk = atRiskResult.rows.filter(r => r.churn_risk_score >= 30 && r.churn_risk_score < 60);
    const lowRisk = atRiskResult.rows.filter(r => r.churn_risk_score < 30);
    
    logRequest('GET', '/api/reports/churn-prediction', 200);
    res.json({
      success: true,
      data: {
        summary: {
          total_at_risk: atRiskResult.rows.length,
          high_risk_count: highRisk.length,
          medium_risk_count: mediumRisk.length,
          low_risk_count: lowRisk.length
        },
        high_risk_leads: highRisk,
        medium_risk_leads: mediumRisk,
        low_risk_leads: lowRisk
      }
    });
    
  } catch (error) {
    console.error('Churn prediction error:', error);
    logRequest('GET', '/api/reports/churn-prediction', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



/**
 * Get campaign ROI analysis
 */
app.get('/api/reports/campaign-roi', async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    if (!company_id) {
      return res.status(400).json({ error: 'company_id is required' });
    }
    
    let dateFilter = '';
    const params = [company_id];
    
    if (start_date && end_date) {
      params.push(start_date, end_date);
      dateFilter = ` AND campaigns.created_at BETWEEN $2 AND $3`;
    }
    
    // Analyze all campaigns (both scheduled_calls and drip_campaigns)
    const scheduledCampaignsResult = await pool.query(`
      SELECT 
        campaigns.id as campaign_id,
        campaigns.campaign_name,
        'scheduled_calls' as campaign_type,
        COUNT(DISTINCT sc.id) as total_contacts,
        COUNT(DISTINCT sc.id) FILTER (WHERE sc.status = 'called') as contacted,
        COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_won') as conversions,
        SUM(i.amount) FILTER (WHERE i.status = 'paid') as revenue_generated,
        0 as total_cost,
        CASE 
          WHEN COUNT(DISTINCT sc.id) FILTER (WHERE sc.status = 'called') > 0 
          THEN (COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_won')::float / COUNT(DISTINCT sc.id) FILTER (WHERE sc.status = 'called') * 100)
          ELSE 0 
        END as conversion_rate
      FROM campaigns
      LEFT JOIN scheduled_calls sc ON campaigns.id = sc.campaign_id
      LEFT JOIN leads l ON sc.lead_id = l.id
      LEFT JOIN invoices i ON l.id = i.lead_id
      WHERE campaigns.company_id = $1 ${dateFilter}
      GROUP BY campaigns.id, campaigns.campaign_name
    `, params);
    
    let dripDateFilter = '';
    if (start_date && end_date) {
      dripDateFilter = ` AND dc.created_at BETWEEN $2 AND $3`;
    }
    
    const dripCampaignsResult = await pool.query(`
      SELECT 
        dc.id as campaign_id,
        dc.campaign_name,
        'drip_campaign' as campaign_type,
        COUNT(DISTINCT dcs.id) as total_contacts,
        COUNT(DISTINCT dse.id) FILTER (WHERE dse.status = 'sent') as contacted,
        COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_won') as conversions,
        SUM(COALESCE(cp.revenue_generated, 0)) as revenue_generated,
        SUM(COALESCE(cp.total_cost, 0)) as total_cost,
        CASE 
          WHEN COUNT(DISTINCT dse.id) FILTER (WHERE dse.status = 'sent') > 0 
          THEN (COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_won')::float / COUNT(DISTINCT dse.id) FILTER (WHERE dse.status = 'sent') * 100)
          ELSE 0 
        END as conversion_rate
      FROM drip_campaigns dc
      LEFT JOIN drip_campaign_subscribers dcs ON dc.id = dcs.campaign_id
      LEFT JOIN drip_step_executions dse ON dcs.id = dse.subscriber_id
      LEFT JOIN leads l ON dcs.lead_id = l.id
      LEFT JOIN campaign_performance cp ON dc.id = cp.campaign_id
      WHERE dc.company_id = $1 ${dripDateFilter}
      GROUP BY dc.id, dc.campaign_name
    `, params);
    
    // Combine results and calculate ROI
    const allCampaigns = [
      ...scheduledCampaignsResult.rows,
      ...dripCampaignsResult.rows
    ].map(campaign => {
      const revenue = parseFloat(campaign.revenue_generated) || 0;
      const cost = parseFloat(campaign.total_cost) || 0;
      const netProfit = revenue - cost;
      const roi = cost > 0 ? ((netProfit / cost) * 100) : 0;
      
      return {
        ...campaign,
        revenue_generated: Math.round(revenue * 100) / 100,
        total_cost: Math.round(cost * 100) / 100,
        net_profit: Math.round(netProfit * 100) / 100,
        roi: Math.round(roi * 100) / 100,
        conversion_rate: Math.round(parseFloat(campaign.conversion_rate) * 100) / 100
      };
    });
    
    // Sort by ROI
    allCampaigns.sort((a, b) => b.roi - a.roi);
    
    logRequest('GET', '/api/reports/campaign-roi', 200);
    res.json({
      success: true,
      count: allCampaigns.length,
      data: allCampaigns
    });
    
  } catch (error) {
    console.error('Campaign ROI analysis error:', error);
    logRequest('GET', '/api/reports/campaign-roi', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



/**
 * Schedule report delivery
 */

app.post('/api/reports/schedule', async (req, res) => {
  try {
    const {
      company_id,
      report_type,
      frequency,
      recipients,
      format = 'pdf',
      delivery_time = '09:00'
    } = req.body;
    
    if (!company_id || !report_type || !frequency || !recipients) {
      return res.status(400).json({
        error: 'company_id, report_type, frequency, and recipients are required'
      });
    }
    
    // Calculate next_delivery based on frequency
    let next_delivery;
    const deliveryTimeStr = delivery_time;
    
    switch(frequency) {
      case 'daily':
        next_delivery = `(CURRENT_DATE + 1) + '${deliveryTimeStr}'::time`;
        break;
      case 'weekly':
        next_delivery = `(CURRENT_DATE + 7) + '${deliveryTimeStr}'::time`;
        break;
      case 'monthly':
        next_delivery = `(CURRENT_DATE + 30) + '${deliveryTimeStr}'::time`;
        break;
      default:
        next_delivery = `(CURRENT_DATE + 1) + '${deliveryTimeStr}'::time`;
    }
    
    const result = await pool.query(`
      INSERT INTO scheduled_reports (
        company_id, report_type, frequency,
        recipients, format, delivery_time,
        is_active, next_delivery
      )
      VALUES ($1, $2, $3, $4, $5, $6, TRUE, ${next_delivery})
      RETURNING *
    `, [
      company_id,
      report_type,
      frequency,
      JSON.stringify(recipients),
      format,
      deliveryTimeStr
    ]);
    
    logRequest('POST', '/api/reports/schedule', 201);
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Report scheduled successfully'
    });
    
  } catch (error) {
    console.error('Schedule report error:', error);
    logRequest('POST', '/api/reports/schedule', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});




/**
 * Get scheduled reports
 */
app.get('/api/reports/scheduled/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM scheduled_reports
      WHERE company_id = $1
      ORDER BY created_at DESC
    `, [company_id]);
    
    logRequest('GET', `/api/reports/scheduled/${company_id}`, 200);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get scheduled reports error:', error);
    logRequest('GET', `/api/reports/scheduled/${company_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



// // Utility function for logging (add to your server.js if not exists)
// function logRequest(method, endpoint, statusCode, details = {}) {
//   const logEntry = {
//     timestamp: new Date().toISOString(),
//     method,
//     endpoint,
//     statusCode,
//     ...details
//   };
//   console.log(JSON.stringify(logEntry));
// }


// ============================================
// 1. AUTO-INVOICE GENERATION
// ============================================

/**
 * POST /api/invoices/auto-generate
 * Auto-generate invoice when deal is closed
 */
app.post('/api/invoices/auto-generate', async (req, res) => {
  try {
    const result = await invoicePayment.autoGenerateInvoice(pool, req.body);
    logRequest('POST', '/api/invoices/auto-generate', 201);
    res.status(201).json(result);
  } catch (error) {
    console.error('Auto-generate invoice error:', error);
    logRequest('POST', '/api/invoices/auto-generate', 500, { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 2. PHONEPE PAYMENT INITIATION
// ============================================

/**
 * POST /api/invoices/:invoice_id/initiate-payment
 * Initiate PhonePe payment for an invoice
 */
app.post('/api/invoices/:invoice_id/initiate-payment', async (req, res) => {
  try {
    const { invoice_id } = req.params;
    const result = await invoicePayment.initiatePayment(pool, invoice_id);
    logRequest('POST', `/api/invoices/${invoice_id}/initiate-payment`, 200);
    res.json(result);
  } catch (error) {
    console.error('Payment initiation error:', error);
    logRequest('POST', `/api/invoices/${req.params.invoice_id}/initiate-payment`, 500);
    res.status(500).json({ 
      error: 'Payment initiation failed', 
      message: error.message 
    });
  }
});

// ============================================
// 3. PHONEPE PAYMENT CALLBACK
// ============================================

/**
 * POST /api/payment-callback
 * Handle PhonePe server-to-server callback
 */
app.post('/api/payment-callback', async (req, res) => {
  try {
    const { response } = req.body;
    const result = await invoicePayment.handlePaymentCallback(pool, response);
    res.json(result);
  } catch (error) {
    console.error('Payment callback error:', error);
    res.status(500).json({ error: 'Callback processing failed' });
  }
});

// ============================================
// 4. PAYMENT RESULT PAGE
// ============================================

/**
 * GET /payment-result
 * Payment result page - Check status and redirect
 */
app.get('/payment-result', async (req, res) => {
  try {
    const { invoice_id, txn_id } = req.query;

    if (!invoice_id || !txn_id) {
      return res.redirect('/payment-failed.html?error=missing_params');
    }

    const result = await invoicePayment.checkPaymentStatus(pool, invoice_id, txn_id);

    if (result.success && result.status === 'completed') {
      res.redirect(`/payment-success.html?invoice_id=${invoice_id}&txn_id=${txn_id}`);
    } else {
      res.redirect(`/payment-failed.html?invoice_id=${invoice_id}&reason=${result.status}`);
    }

  } catch (error) {
    console.error('Payment result error:', error);
    res.redirect('/payment-failed.html?error=status_check_failed');
  }
});

// ============================================
// 5. SUBSCRIPTION RENEWAL CHECK
// ============================================

/**
 * POST /api/subscriptions/check-renewals
 * Check expiring subscriptions and send reminders
 */
app.post('/api/subscriptions/check-renewals', async (req, res) => {
  try {
    const result = await invoicePayment.checkRenewals(pool);
    logRequest('POST', '/api/subscriptions/check-renewals', 200);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Check renewals error:', error);
    logRequest('POST', '/api/subscriptions/check-renewals', 500);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 6. OVERDUE INVOICE HANDLER
// ============================================

/**
 * POST /api/invoices/handle-overdue
 * Handle overdue invoices with escalating reminders
 */
app.post('/api/invoices/handle-overdue', async (req, res) => {
  try {
    const result = await invoicePayment.handleOverdueInvoices(pool);
    logRequest('POST', '/api/invoices/handle-overdue', 200);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Handle overdue error:', error);
    logRequest('POST', '/api/invoices/handle-overdue', 500);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 7. ACCOUNTING SOFTWARE SYNC
// ============================================

/**
 * POST /api/invoices/:invoice_id/sync-accounting
 * Sync invoice to QuickBooks/Zoho/Tally
 */
app.post('/api/invoices/:invoice_id/sync-accounting', async (req, res) => {
  try {
    const { invoice_id } = req.params;
    const { accounting_system } = req.body;

    const result = await invoicePayment.syncInvoiceToAccounting(
      pool, 
      invoice_id, 
      accounting_system
    );

    logRequest('POST', `/api/invoices/${invoice_id}/sync-accounting`, 200);
    res.json(result);

  } catch (error) {
    console.error('Accounting sync error:', error);
    logRequest('POST', `/api/invoices/${req.params.invoice_id}/sync-accounting`, 500);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 8. REVENUE DASHBOARD
// ============================================

/**
 * GET /api/reports/revenue-dashboard
 * Get revenue metrics and trends
 */
app.get('/api/reports/revenue-dashboard', async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;

    const result = await invoicePayment.getRevenueDashboard(
      pool, 
      company_id, 
      start_date, 
      end_date
    );

    logRequest('GET', '/api/reports/revenue-dashboard', 200);
    res.json({ success: true, data: result });

  } catch (error) {
    console.error('Revenue dashboard error:', error);
    logRequest('GET', '/api/reports/revenue-dashboard', 500);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 9. OVERDUE INVOICES REPORT
// ============================================

/**
 * GET /api/reports/overdue-invoices
 * Get overdue invoices with aging buckets
 */
app.get('/api/reports/overdue-invoices', async (req, res) => {
  try {
    const { company_id } = req.query;

    const result = await invoicePayment.getOverdueInvoicesReport(pool, company_id);

    logRequest('GET', '/api/reports/overdue-invoices', 200);
    res.json({ success: true, ...result });

  } catch (error) {
    console.error('Overdue report error:', error);
    logRequest('GET', '/api/reports/overdue-invoices', 500);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 10. CHURN ANALYSIS
// ============================================

/**
 * GET /api/reports/churn-analysis
 * Get churn analysis for expired subscriptions
 */
app.get('/api/reports/churn-analysis', async (req, res) => {
  try {
    const { company_id, months = 6 } = req.query;

    const result = await invoicePayment.getChurnAnalysis(pool, company_id, months);

    logRequest('GET', '/api/reports/churn-analysis', 200);
    res.json({ success: true, ...result });

  } catch (error) {
    console.error('Churn analysis error:', error);
    logRequest('GET', '/api/reports/churn-analysis', 500);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 11. ACTIVE SUBSCRIPTIONS
// ============================================

/**
 * GET /api/subscriptions/active
 * Get all active subscriptions
 */
app.get('/api/subscriptions/active', async (req, res) => {
  try {
    const { company_id } = req.query;

    const result = await invoicePayment.getActiveSubscriptions(pool, company_id);

    logRequest('GET', '/api/subscriptions/active', 200);
    res.json({ success: true, ...result });

  } catch (error) {
    console.error('Active subscriptions error:', error);
    logRequest('GET', '/api/subscriptions/active', 500);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 12. GET INVOICE BY ID
// ============================================

/**
 * GET /api/invoices/:invoice_id
 * Get invoice details by ID
 */
app.get('/api/invoices/:invoice_id', async (req, res) => {
  try {
    const { invoice_id } = req.params;

    const invoice = await invoicePayment.getInvoiceById(pool, invoice_id);

    logRequest('GET', `/api/invoices/${invoice_id}`, 200);
    res.json({ success: true, invoice });

  } catch (error) {
    console.error('Get invoice error:', error);
    logRequest('GET', `/api/invoices/${req.params.invoice_id}`, 500);
    
    if (error.message === 'Invoice not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// ============================================
// 13. LIST ALL INVOICES
// ============================================

/**
 * GET /api/invoices
 * List all invoices with filters
 */
app.get('/api/invoices', async (req, res) => {
  try {
    const result = await invoicePayment.listInvoices(pool, req.query);

    logRequest('GET', '/api/invoices', 200);
    res.json({ success: true, ...result });

  } catch (error) {
    console.error('List invoices error:', error);
    logRequest('GET', '/api/invoices', 500);
    res.status(500).json({ error: error.message });
  }
});





   







// ============================================
// AUTOMATED BACKGROUND TASKS
// ============================================

// Auto-score leads every hour
if (process.env.NODE_ENV === 'production') {
  setInterval(async () => {
    try {
      console.log('🔄 Running auto-scoring for pending leads...');
      
      const leadsResult = await pool.query(`
        SELECT id, company_id 
        FROM leads 
        WHERE metadata->>'auto_score_pending' = 'true'
        OR metadata->'lead_score' IS NULL
        OR (metadata->'lead_score'->>'calculated_at')::timestamp < NOW() - INTERVAL '24 hours'
        LIMIT 100
      `);
      
      for (const lead of leadsResult.rows) {
        try {
          await calculateLeadScore(lead.id);
          await applyRoutingRules(lead.id, lead.company_id);
        } catch (error) {
          console.error(`Failed to score lead ${lead.id}:`, error.message);
        }
      }
      
      console.log(`✅ Auto-scored ${leadsResult.rows.length} leads`);
    } catch (error) {
      console.error('Auto-scoring error:', error);
    }
  }, 60 * 60 * 1000); // Every hour

  // Send task reminders
  setInterval(async () => {
    try {
      console.log('🔔 Checking for task reminders...');
      
      const tasksResult = await pool.query(`
        SELECT 
          t.*,
          ha.email as agent_email,
          ha.phone as agent_phone,
          l.name as lead_name
        FROM tasks t
        JOIN human_agents ha ON t.assigned_to_agent_id = ha.id
        JOIN leads l ON t.lead_id = l.id
        WHERE t.status = 'pending'
        AND t.reminder_sent = FALSE
        AND t.due_date <= NOW() + (t.reminder_before_minutes || ' minutes')::interval
        AND t.due_date > NOW()
        LIMIT 50
      `);
      
      for (const task of tasksResult.rows) {
        try {
          await pool.query(`
            INSERT INTO system_notifications (
              notification_type, title, message, priority
            )
            VALUES ('task_reminder', $1, $2, 'high')
          `, [
            `⏰ Task Due Soon: ${task.title}`,
            `Task for ${task.lead_name} is due in ${task.reminder_before_minutes} minutes`
          ]);
          
          await pool.query(
            'UPDATE tasks SET reminder_sent = TRUE WHERE id = $1',
            [task.id]
          );
        } catch (error) {
          console.error(`Failed to send reminder for task ${task.id}:`, error.message);
        }
      }
      console.log(`✅ Sent ${tasksResult.rows.length} task reminders`);
    } catch (error) {
      console.error('Task reminder error:', error);
    }
  }, 15 * 60 * 1000); // Every 15 minutes


  // Auto-create follow-up tasks for hot leads
  setInterval(async () => {
    try {
      console.log('📋 Auto-creating follow-up tasks...');
      
      const hotLeadsResult = await pool.query(`
        SELECT 
          l.id,
          l.company_id,
          l.name,
          (l.metadata->'lead_score'->>'grade') as grade
        FROM leads l
        WHERE (l.metadata->'lead_score'->>'grade') IN ('A', 'B')
        AND l.lead_status NOT IN ('closed_won', 'closed_lost')
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.lead_id = l.id
          AND t.status = 'pending'
          AND t.created_at > NOW() - INTERVAL '24 hours'
        )
        LIMIT 20
      `);
      
      for (const lead of hotLeadsResult.rows) {
        try {
          await pool.query(`
            INSERT INTO tasks (
              company_id, lead_id, task_type, title,
              description, due_date, priority, status
            )
            VALUES ($1, $2, 'follow_up', $3, $4, $5, $6, 'pending')
          `, [
            lead.company_id,
            lead.id,
            `Follow up with ${lead.name || 'lead'}`,
            `High-value lead (Grade ${lead.grade}) needs immediate follow-up`,
            new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
            lead.grade === 'A' ? 'urgent' : 'high'
          ]);
        } catch (error) {
          console.error(`Failed to create task for lead ${lead.id}:`, error.message);
        }
      }
      
      console.log(`✅ Created ${hotLeadsResult.rows.length} follow-up tasks`);
    } catch (error) {
      console.error('Auto-create tasks error:', error);
    }
  }, 2 * 60 * 60 * 1000); // Every 2 hours

  // Invoice reminder automation
  setInterval(async () => {
    try {
      console.log('💰 Checking invoice reminders...');
      
      await axios.post(`${process.env.BASE_URL}/api/whatsapp/send-invoice-reminders`);
      
    } catch (error) {
      console.error('Invoice reminder automation error:', error);
    }
  }, 24 * 60 * 60 * 1000); // Daily

  console.log('✓ Automated background tasks initialized');
}



// ============================================
// AUTOMATED LEAD SYNC FROM AD PLATFORMS
// ============================================

if (process.env.NODE_ENV === 'production') {
  // Sync leads every 15 minutes
  setInterval(async () => {
    try {
      console.log('🔄 Running automated lead sync...');
      
      // Get all active lead source configs
      const configsResult = await pool.query(`
        SELECT DISTINCT company_id, platform
        FROM lead_source_configs
        WHERE is_active = TRUE
      `);
      
      for (const config of configsResult.rows) {
        try {
          if (config.platform === 'meta') {
            await axios.post(`${process.env.BASE_URL}/api/oauth/meta/sync-leads`, {
              company_id: config.company_id,
              limit: 10
            });
          }
          // Add Google Ads and LinkedIn sync here if needed
        } catch (syncError) {
          console.error(`Failed to sync ${config.platform} for company ${config.company_id}:`, syncError.message);
        }
      }
      
      console.log('✅ Lead sync completed');
    } catch (error) {
      console.error('Lead sync error:', error);
    }
  }, 15 * 60 * 1000); // Every 15 minutes
  
  console.log('✓ Automated lead sync initialized (15min intervals)');
}



// ============================================
// BACKGROUND TASKS FOR MODULE 7 & 8
// ============================================

if (process.env.NODE_ENV === 'production') {
  // Execute drip campaign steps every 5 minutes
  setInterval(async () => {
    try {
      console.log('🔄 Executing pending drip campaign steps...');
      await executePendingDripSteps();
    } catch (error) {
      console.error('Drip campaign execution error:', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  console.log('✓ Drip campaign automation initialized (5min intervals)');
}


// ============================================
// CRON JOB SETUP (For Production)
// ============================================

if (process.env.NODE_ENV === 'production') {
  const cron = require('node-cron');

  // Check renewals daily at 9 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('🔄 Running daily renewal check...');
    try {
      await invoicePayment.checkRenewals(pool);
    } catch (error) {
      console.error('Renewal check cron error:', error);
    }
  });

  // Handle overdue invoices daily at 10 AM
  cron.schedule('0 10 * * *', async () => {
    console.log('🔄 Running overdue invoice check...');
    try {
      await invoicePayment.handleOverdueInvoices(pool);
    } catch (error) {
      console.error('Overdue invoice cron error:', error);
    }
  });

  console.log('✅ Invoice & Payment automation jobs initialized');
}




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
  console.log(`✓ WebSocket server running on ws://localhost:${PORT}/ws/live-call/:call_sid`);
  console.log(`✓ Database: ${process.env.DB_NAME}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV}\n`);
});
