
const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');
const { normalizePhoneNumber } = require('../utils/helpers');
const { calculateLeadScore: scoreLeadFunction } = require('../services/leads/leadScoringService');

/**
 * Get all leads with optional filters
 */
exports.getAllLeads = async (req, res) => {
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
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/leads', 500);
    handleError(res, error);
  }
};

/**
 * Create or update a lead
 */
exports.createOrUpdateLead = async (req, res) => {
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
      // tags ? JSON.stringify(tags) : null,
      Array.isArray(tags) ? tags : null,
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
};

/**
 * Update lead by ID
 */
exports.updateLeadById = async (req, res) => {
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
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/leads/${lead_id}`, 500);
    handleError(res, error);
  }
};

/**
 * Get single lead by ID
 */
exports.getLeadById = async (req, res) => {
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
      logRequest('GET', `/api/leads/${lead_id}`, 404);
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    
    logRequest('GET', `/api/leads/${lead_id}`, 200);
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/leads/${lead_id}`, 500); 
    handleError(res, error);
  }
};

/**
 * Get lead by phone number
 */
exports.getLeadByPhone = async (req, res) => {
  try {
    let { phone } = req.params;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone parameter is required' });
    }

    // Normalize phone — always ensure it starts with '+'
    phone = normalizePhoneNumber(phone);

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
};

/**
 * Update lead interest level
 */
exports.updateLeadInterest = async (req, res) => {
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
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/leads/${phone}/interest`, 500);
    handleError(res, error);
  }
};

/**
 * Bulk import leads
 */
exports.bulkImportLeads = async (req, res) => {
  try {
    const { leads } = req.body;
    
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'leads array is required' });
    }
    
    const results = [];
    const errors = [];
    
    for (const lead of leads) {
      try {
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
};

/**
 * Bulk update interest level for multiple leads
 */
exports.bulkUpdateInterest = async (req, res) => {
  try {
    const { leads } = req.body;
    
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'leads array is required with phone_number and interest_level' });
    }
    
    const results = [];
    const errors = [];
    
    for (const lead of leads) {
      try {
        if (!lead.phone_number || !lead.interest_level) {
          errors.push({ lead: lead, error: 'phone_number and interest_level are required' });
          continue;
        }

        if (lead.interest_level < 1 || lead.interest_level > 10) {
          errors.push({ lead: lead, error: 'interest_level must be between 1 and 10' });
          continue;
        }

        const query = `
          UPDATE leads
          SET interest_level = $1, updated_at = CURRENT_TIMESTAMP
          WHERE phone_number = $2
          RETURNING *;
        `;
        
        const result = await pool.query(query, [lead.interest_level, lead.phone_number]);
        
        if (result.rows.length > 0) {
          results.push(result.rows[0]);
        } else {
          errors.push({ phone: lead.phone_number, error: 'Lead not found' });
        }
      } catch (error) {
        console.error(`Error updating interest for ${lead.phone_number}:`, error.message);
        errors.push({ phone: lead.phone_number, error: error.message });
      }
    }
    
    logRequest('POST', '/api/leads/bulk-update-interest', 200);
    res.json({ 
      success: true, 
      updated: results.length,
      failed: errors.length,
      data: results,
      errors: errors
    });
  } catch (error) {
    console.error('Bulk update interest error:', error);
    logRequest('POST', '/api/leads/bulk-update-interest', 500);
    handleError(res, error);
  }
};

/**
 * Get language preference for a lead
 */
exports.getLanguagePreference = async (req, res) => {
  try {
    let { phone } = req.params;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone parameter is required' });
    }

    phone = normalizePhoneNumber(phone);

    const query = `
      SELECT id, phone_number, language_preference, name
      FROM leads 
      WHERE phone_number = $1;
    `;
    
    const result = await pool.query(query, [phone]);

    if (result.rows.length === 0) {
      logRequest('GET', `/api/leads/${phone}/language`, 404);
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    logRequest('GET', `/api/leads/${phone}/language`, 200);
    sendSuccess(res, { 
      data: {
        phone_number: result.rows[0].phone_number,
        language_preference: result.rows[0].language_preference || 'english',
        name: result.rows[0].name
      }
    });
  } catch (error) {
    logRequest('GET', `/api/leads/${phone}/language`, 500);
    handleError(res, error);
  }
};

/**
 * Update language preference for a lead
 */
exports.updateLanguagePreference = async (req, res) => {
  try {
    let { phone } = req.params;
    const { language_preference } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone parameter is required' });
    }

    if (!language_preference) {
      return res.status(400).json({ error: 'language_preference is required' });
    }

    const validLanguages = ['english', 'hindi', 'kannada', 'tamil', 'telugu', 'malayalam', 'bengali', 'marathi'];
    if (!validLanguages.includes(language_preference.toLowerCase())) {
      return res.status(400).json({ 
        error: `Invalid language. Must be one of: ${validLanguages.join(', ')}` 
      });
    }

    phone = normalizePhoneNumber(phone);

    const query = `
      UPDATE leads
      SET language_preference = $1, updated_at = CURRENT_TIMESTAMP
      WHERE phone_number = $2
      RETURNING *;
    `;

    const result = await pool.query(query, [language_preference.toLowerCase(), phone]);

    if (result.rows.length === 0) {
      logRequest('PATCH', `/api/leads/${phone}/language`, 404);
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    logRequest('PATCH', `/api/leads/${phone}/language`, 200);
    sendSuccess(res, { 
      data: result.rows[0],
      message: `Language preference updated to ${language_preference}`
    });
  } catch (error) {
    logRequest('PATCH', `/api/leads/${phone}/language`, 500);
    handleError(res, error);
  }
};

/**
 * Update last contacted timestamp for a lead
 */
exports.updateLastContacted = async (req, res) => {
  try {
    let { phone } = req.params;
    const { last_contacted } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone parameter is required' });
    }

    phone = normalizePhoneNumber(phone);

    const timestamp = last_contacted || new Date().toISOString();

    const query = `
      UPDATE leads
      SET last_contacted = $1, updated_at = CURRENT_TIMESTAMP
      WHERE phone_number = $2
      RETURNING *;
    `;

    const result = await pool.query(query, [timestamp, phone]);

    if (result.rows.length === 0) {
      logRequest('PATCH', `/api/leads/${phone}/last-contacted`, 404);
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    logRequest('PATCH', `/api/leads/${phone}/last-contacted`, 200);
    sendSuccess(res, { 
      data: result.rows[0],
      message: 'Last contacted timestamp updated'
    });
  } catch (error) {
    logRequest('PATCH', `/api/leads/${phone}/last-contacted`, 500);
    handleError(res, error);
  }
};

/**
 * Search leads
 */
exports.searchLeads = async (req, res) => {
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
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/search/leads', 500);
    handleError(res, error);
  }
};



// Get lead custom fields
exports.getLeadCustomFields = async (req, res) => {
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
    logRequest('GET', `/api/leads/${req.params.lead_id}/custom-fields`, 500);
    handleError(res, error);
  }
};



// Update lead status
exports.updateLeadStatus = async (req, res) => {
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
    
    const query = `UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    logRequest('PATCH', `/api/leads/${lead_id}/status`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/leads/${req.params.lead_id}/status`, 500);
    handleError(res, error);
  }
};




// Export leads to CSV
exports.exportLeadsToCSV = async (req, res) => {
  try {
    const { company_id } = req.query;
    
    if (!company_id) {
      return res.status(400).json({ error: 'company_id is required' });
    }
    
    const query = `
      SELECT 
        l.id,
        l.name,
        l.phone_number,
        l.email,
        l.lead_status,
        l.interest_level,
        l.lead_source,
        l.created_at,
        l.updated_at,
        COUNT(DISTINCT cl.id) as total_calls,
        COUNT(DISTINCT wm.id) as total_messages
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
    
    const headers = Object.keys(result.rows[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of result.rows) {
      const values = headers.map(header => {
        const val = row[header];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return val;
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
};


// Get lead by phone
exports.getLeadByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    
    const result = await pool.query('SELECT * FROM leads WHERE phone_number = $1', [phone]);
    
    if (result.rows.length === 0) {
      logRequest('GET', `/api/leads/phone/${phone}`, 404);
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    
    logRequest('GET', `/api/leads/phone/${phone}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/leads/phone/${req.params.phone}`, 500);
    handleError(res, error);
  }
};

// Update lead by phone
exports.updateLeadByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const { tags, metadata, ...updates } = req.body;
    
    const { rows: [lead] } = await pool.query(
      'SELECT tags FROM leads WHERE phone_number = $1', 
      [phone]
    );
    
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const mergedTags = Array.from(new Set([...(lead.tags || []), ...(tags || [])]));

    const setClauses = [];
    const values = [];
    let idx = 1;

    if (updates.name) {
      setClauses.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.email) {
      setClauses.push(`email = $${idx++}`);
      values.push(updates.email);
    }
    if (tags) {
      setClauses.push(`tags = $${idx++}`);
      values.push(mergedTags);
    }
    if (metadata) {
      setClauses.push(`metadata = metadata || $${idx++}::jsonb`);
      values.push(JSON.stringify(metadata));
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    values.push(phone);

    const query = `UPDATE leads SET ${setClauses.join(', ')} WHERE phone_number = $${idx} RETURNING *`;
    const { rows } = await pool.query(query, values);
    
    logRequest('PATCH', `/api/leads/phone/${phone}`, 200);
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    logRequest('PATCH', `/api/leads/phone/${req.params.phone}`, 500);
    handleError(res, error);
  }
};




// Delete lead
exports.deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM leads WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    logRequest('DELETE', `/api/leads/${id}`, 200);
    res.json({ success: true, message: 'Lead deleted' });
  } catch (error) {
    logRequest('DELETE', `/api/leads/${req.params.id}`, 500);
    handleError(res, error);
  }
};



// Update lead
exports.updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const setClauses = [];
    const values = [];
    let paramCount = 0;
    
    for (const [key, value] of Object.entries(updates)) {
      if (['name', 'email', 'lead_status', 'interest_level', 'notes'].includes(key)) {
        paramCount++;
        setClauses.push(`${key} = $${paramCount}`);
        values.push(value);
      }
    }
    
    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    values.push(id);
    
    const query = `UPDATE leads SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    logRequest('PUT', `/api/leads/${id}`, 200);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('PUT', `/api/leads/${req.params.id}`, 500);
    handleError(res, error);
  }
};




// // Get lead by ID
// exports.get_LeadBy_Id = async (req, res) => {
//   try {
//     const { id } = req.params;
    
//     const result = await pool.query('SELECT * FROM leads WHERE id = $1', [id]);
    
//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: 'Lead not found' });
//     }
    
//     logRequest('GET', `/api/leads/${id}`, 200);
//     res.json({ success: true, data: result.rows[0] });
//   } catch (error) {
//     logRequest('GET', `/api/leads/${req.params.id}`, 500);
//     handleError(res, error);
//   }
// };




// Create lead
exports.createLead = async (req, res) => {
  try {
    const { company_id, phone_number, name, email, lead_source } = req.body;
    
    if (!company_id || !phone_number) {
      return res.status(400).json({ error: 'company_id and phone_number required' });
    }
    
    const result = await pool.query(
      `INSERT INTO leads (company_id, phone_number, name, email, lead_source, lead_status)
       VALUES ($1, $2, $3, $4, $5, 'new')
       RETURNING *`,
      [company_id, phone_number, name, email, lead_source || 'manual']
    );
    
    logRequest('POST', '/api/leads', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/leads', 500);
    handleError(res, error);
  }
};




// Get all leads
exports.getLeads = async (req, res) => {
  try {
    const { company_id, lead_status, limit, offset } = req.query;
    
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    let paramCount = 0;
    
    if (company_id) {
      paramCount++;
      params.push(company_id);
      query += ` AND company_id = $${paramCount}`;
    }
    
    if (lead_status) {
      paramCount++;
      params.push(lead_status);
      query += ` AND lead_status = $${paramCount}`;
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (limit) {
      paramCount++;
      params.push(parseInt(limit));
      query += ` LIMIT $${paramCount}`;
    }
    
    if (offset) {
      paramCount++;
      params.push(parseInt(offset));
      query += ` OFFSET $${paramCount}`;
    }
    
    const result = await pool.query(query, params);
    
    logRequest('GET', '/api/leads', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/leads', 500);
    handleError(res, error);
  }
};




// ============================================
// AI LEAD SCORING
// ============================================

exports.calculateLeadScore = async (req, res) => {
  try {
    const { lead_id } = req.params;
    
    const scoreData = await scoreLeadFunction(lead_id);
    
    logRequest('POST', `/api/leads/${lead_id}/calculate-score`, 200);
    res.json({
      success: true,
      lead_id: parseInt(lead_id),
      ...scoreData
    });
  } catch (error) {
    console.error('Calculate score error:', error);
    logRequest('POST', `/api/leads/${req.params.lead_id}/calculate-score`, 500);
    handleError(res, error);
  }
};

exports.batchCalculateScores = async (req, res) => {
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
    
    query += ' LIMIT 1000';
    
    const leadsResult = await pool.query(query, params);
    
    const results = [];
    const errors = [];
    
    for (const lead of leadsResult.rows) {
      try {
        const scoreData = await scoreLeadFunction(lead.id);
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
    handleError(res, error);
  }
};



exports.getTopScoredLeads = async (req, res) => {
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
    handleError(res, error);
  }
};