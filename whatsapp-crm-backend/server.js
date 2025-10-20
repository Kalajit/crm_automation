// ============================================
// WhatsApp CRM Backend - Express Server
// ============================================

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

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

// ============================================
// 1. LEAD MANAGEMENT ENDPOINTS
// ============================================

// Create or update a lead
app.post('/api/leads', async (req, res) => {
  try {
    const { phone_number, name, email, lead_source, interest_level, tags } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    const query = `
      INSERT INTO leads (phone_number, name, email, lead_source, interest_level, tags)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (phone_number) DO UPDATE
      SET name = COALESCE($2, name),
          email = COALESCE($3, email),
          interest_level = COALESCE($5, interest_level),
          tags = COALESCE($6, tags),
          updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const result = await pool.query(query, [
      phone_number,
      name || null,
      email || null,
      lead_source || 'whatsapp',
      interest_level || 1,
      tags ? JSON.stringify(tags) : null,
    ]);

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

// Get lead by phone number
app.get('/api/leads/:phone', async (req, res) => {
  try {
    const { phone } = req.params;

    if (!phone) {
      return res.status(400).json({ error: 'phone parameter is required' });
    }

    const query = `SELECT * FROM leads WHERE phone_number = $1;`;
    const result = await pool.query(query, [phone]);

    if (result.rows.length === 0) {
      logRequest('GET', `/api/leads/${phone}`, 404);
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    logRequest('GET', `/api/leads/${phone}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/leads/${phone}`, 500);
    handleError(res, error);
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
        VALUES ($1, $2, '[]'::jsonb)
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
        l.lead_status
      FROM conversations c
      JOIN leads l ON c.lead_id = l.id
      WHERE c.phone_number = $1
      ORDER BY c.updated_at DESC
      LIMIT 1;
    `;

    const result = await pool.query(query, [phone]);

    if (result.rows.length === 0) {
      logRequest('GET', `/api/conversations/${phone}`, 404);
      return res.status(404).json({ success: false, error: 'Conversation not found' });
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

    const query = `
      INSERT INTO faq_templates (question, answer, category, keywords, priority)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      question,
      answer,
      category || 'general',
      keywords ? JSON.stringify(keywords) : null,
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
// 7. WEBHOOK ENDPOINT (FROM n8n)
// ============================================

// Webhook to receive data from n8n workflow
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
      ai_summary,
      timestamp
    } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    // 1. Create or update lead
    let leadId;
    let leadQuery = `SELECT id FROM leads WHERE phone_number = $1;`;
    let leadResult = await pool.query(leadQuery, [phone_number]);

    if (leadResult.rows.length === 0) {
      const createLead = `
        INSERT INTO leads (phone_number, name, lead_source, interest_level)
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `;
      leadResult = await pool.query(createLead, [phone_number, name, lead_source || 'whatsapp', interest_level || 1]);
    }
    leadId = leadResult.rows[0].id;

    // 2. Get or create conversation
    let convQuery = `SELECT id FROM conversations WHERE lead_id = $1;`;
    let convResult = await pool.query(convQuery, [leadId]);

    let convId;
    if (convResult.rows.length === 0) {
      const createConv = `
        INSERT INTO conversations (lead_id, phone_number, conversation_history)
        VALUES ($1, $2, '[]'::jsonb)
        RETURNING id;
      `;
      convResult = await pool.query(createConv, [leadId, phone_number]);
      convId = convResult.rows[0].id;
    } else {
      convId = convResult.rows[0].id;
    }

    // 3. Store message
    if (message_body) {
      await pool.query(
        `INSERT INTO whatsapp_messages 
         (conversation_id, lead_id, phone_number, message_type, message_body, sender, message_id, is_from_user)
         VALUES ($1, $2, $3, 'text', $4, 'bot', $5, FALSE);`,
        [convId, leadId, phone_number, message_body, message_id]
      );
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
    logRequest('POST', '/api/webhook/n8n', 500);
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