// const pool = require('../config/database');
// const { sendSuccess, handleError } = require('../utils/response');
// const { logRequest } = require('../utils/logger');
// const { normalizePhoneNumber } = require('../utils/helpers');

// /**
//  * Get all leads with optional filters
//  */
// exports.getAllLeads = async (req, res) => {
//   try {
//     const { status, limit } = req.query;
    
//     let query = 'SELECT * FROM leads WHERE 1=1';
//     const params = [];
    
//     if (status) {
//       params.push(status);
//       query += ` AND lead_status = $${params.length}`;
//     }
    
//     query += ' ORDER BY created_at DESC';
    
//     if (limit) {
//       params.push(parseInt(limit));
//       query += ` LIMIT $${params.length}`;
//     }
    
//     const result = await pool.query(query, params);
    
//     logRequest('GET', '/api/leads', 200);
//     sendSuccess(res, { data: result.rows });
//   } catch (error) {
//     logRequest('GET', '/api/leads', 500);
//     handleError(res, error);
//   }
// };

// /**
//  * Create or update a lead
//  */
// exports.createOrUpdateLead = async (req, res) => {
//   try {
//     const { 
//       phone_number, 
//       name, 
//       email, 
//       lead_source, 
//       interest_level, 
//       chess_rating,
//       location,
//       tournament_experience,
//       coaching_experience,
//       education_certs,
//       availability,
//       age_group_pref,
//       conversation_history,
//       last_contacted,
//       notes,
//       tags 
//     } = req.body;

//     if (!phone_number) {
//       return res.status(400).json({ error: 'phone_number is required' });
//     }

//     const query = `
//       INSERT INTO leads (
//         phone_number, name, email, lead_source, interest_level,
//         chess_rating, location, tournament_experience, coaching_experience,
//         education_certs, availability, age_group_pref, last_contacted, notes, tags
//       )
//       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
//       ON CONFLICT (phone_number) DO UPDATE
//       SET 
//         name = COALESCE(EXCLUDED.name, leads.name),
//         email = COALESCE(EXCLUDED.email, leads.email),
//         interest_level = COALESCE(EXCLUDED.interest_level, leads.interest_level),
//         chess_rating = COALESCE(EXCLUDED.chess_rating, leads.chess_rating),
//         location = COALESCE(EXCLUDED.location, leads.location),
//         tournament_experience = COALESCE(EXCLUDED.tournament_experience, leads.tournament_experience),
//         coaching_experience = COALESCE(EXCLUDED.coaching_experience, leads.coaching_experience),
//         education_certs = COALESCE(EXCLUDED.education_certs, leads.education_certs),
//         availability = COALESCE(EXCLUDED.availability, leads.availability),
//         age_group_pref = COALESCE(EXCLUDED.age_group_pref, leads.age_group_pref),
//         last_contacted = COALESCE(EXCLUDED.last_contacted, leads.last_contacted),
//         notes = COALESCE(EXCLUDED.notes, leads.notes),
//         tags = COALESCE(EXCLUDED.tags, leads.tags),
//         updated_at = CURRENT_TIMESTAMP
//       RETURNING *;
//     `;

//     const result = await pool.query(query, [
//       phone_number,
//       name || null,
//       email || null,
//       lead_source || 'whatsapp',
//       interest_level || 1,
//       chess_rating || null,
//       location || null,
//       tournament_experience || null,
//       coaching_experience || null,
//       education_certs || null,
//       availability || null,
//       age_group_pref || null,
//       last_contacted || new Date().toISOString(),
//       notes || null,
//       tags ? JSON.stringify(tags) : null,
//     ]);

//     // If conversation_history provided, update conversations table
//     if (conversation_history && result.rows[0].id) {
//       const leadId = result.rows[0].id;
      
//       // Check if conversation exists
//       const convCheck = await pool.query(
//         `SELECT id FROM conversations WHERE lead_id = $1`,
//         [leadId]
//       );

//       if (convCheck.rows.length > 0) {
//         // Update existing conversation
//         await pool.query(
//           `UPDATE conversations 
//            SET conversation_history = $1, updated_at = CURRENT_TIMESTAMP 
//            WHERE lead_id = $2`,
//           [conversation_history, leadId]
//         );
//       } else {
//         // Create new conversation
//         await pool.query(
//           `INSERT INTO conversations (lead_id, phone_number, conversation_history) 
//            VALUES ($1, $2, $3)`,
//           [leadId, phone_number, conversation_history]
//         );
//       }
//     }

//     logRequest('POST', '/api/leads', 201);
//     res.status(201).json({
//       success: true,
//       data: result.rows[0],
//     });
//   } catch (error) {
//     logRequest('POST', '/api/leads', 500);
//     handleError(res, error);
//   }
// };

// /**
//  * Update lead by ID
//  */
// exports.updateLeadById = async (req, res) => {
//   try {
//     const { lead_id } = req.params;
//     const { lead_status, interest_level, last_contacted, notes } = req.body;
    
//     const updates = [];
//     const params = [];
    
//     if (lead_status) {
//       params.push(lead_status);
//       updates.push(`lead_status = $${params.length}`);
//     }
    
//     if (interest_level) {
//       params.push(interest_level);
//       updates.push(`interest_level = $${params.length}`);
//     }
    
//     if (last_contacted) {
//       params.push(last_contacted);
//       updates.push(`last_contacted = $${params.length}`);
//     }
    
//     if (notes) {
//       params.push(notes);
//       updates.push(`notes = $${params.length}`);
//     }
    
//     if (updates.length === 0) {
//       return res.status(400).json({ error: 'No fields to update' });
//     }
    
//     updates.push('updated_at = CURRENT_TIMESTAMP');
//     params.push(lead_id);
    
//     const query = `
//       UPDATE leads
//       SET ${updates.join(', ')}
//       WHERE id = $${params.length}
//       RETURNING *;
//     `;
    
//     const result = await pool.query(query, params);
    
//     if (result.rows.length === 0) {
//       return res.status(404).json({ success: false, error: 'Lead not found' });
//     }
    
//     logRequest('PATCH', `/api/leads/${lead_id}`, 200);
//     sendSuccess(res, { data: result.rows[0] });
//   } catch (error) {
//     logRequest('PATCH', `/api/leads/${lead_id}`, 500);
//     handleError(res, error);
//   }
// };

// /**
//  * Get single lead by ID
//  */
// exports.getLeadById = async (req, res) => {
//   try {
//     const { lead_id } = req.params;
    
//     const query = `
//       SELECT l.*, c.name as company_name
//       FROM leads l
//       LEFT JOIN companies c ON l.company_id = c.id
//       WHERE l.id = $1
//     `;
    
//     const result = await pool.query(query, [lead_id]);
    
//     if (result.rows.length === 0) {
//       logRequest('GET', `/api/leads/${lead_id}`, 404);
//       return res.status(404).json({ success: false, error: 'Lead not found' });
//     }
    
//     logRequest('GET', `/api/leads/${lead_id}`, 200);
//     sendSuccess(res, { data: result.rows[0] });
//   } catch (error) {
//     logRequest('GET', `/api/leads/${lead_id}`, 500); 
//     handleError(res, error);
//   }
// };

// /**
//  * Get lead by phone number
//  */
// exports.getLeadByPhone = async (req, res) => {
//   try {
//     let { phone } = req.params;

//     if (!phone) {
//       return res.status(400).json({ success: false, error: 'Phone parameter is required' });
//     }

//     // Normalize phone — always ensure it starts with '+'
//     phone = normalizePhoneNumber(phone);

//     // Query DB
//     const query = `SELECT * FROM leads WHERE phone_number = $1;`;
//     const result = await pool.query(query, [phone]);

//     // Always return 200 OK
//     if (result.rows.length === 0) {
//       logRequest('GET', `/api/leads/by-phone/${phone}`, 200);
//       return res.json({ success: false, data: null, message: 'Lead not found' });
//     }

//     // Lead found
//     logRequest('GET', `/api/leads/by-phone/${phone}`, 200);
//     return res.json({ success: true, data: result.rows[0] });
//   } catch (error) {
//     logRequest('GET', `/api/leads/by-phone/${phone}`, 500);
//     return res.status(500).json({ success: false, error: error.message });
//   }
// };

// /**
//  * Update lead interest level
//  */
// exports.updateLeadInterest = async (req, res) => {
//   try {
//     const { phone } = req.params;
//     const { interest_level } = req.body;

//     if (!interest_level || interest_level < 1 || interest_level > 10) {
//       return res.status(400).json({ error: 'interest_level must be between 1 and 10' });
//     }

//     const query = `
//       UPDATE leads
//       SET interest_level = $1, updated_at = CURRENT_TIMESTAMP
//       WHERE phone_number = $2
//       RETURNING *;
//     `;

//     const result = await pool.query(query, [interest_level, phone]);

//     if (result.rows.length === 0) {
//       logRequest('PATCH', `/api/leads/${phone}/interest`, 404);
//       return res.status(404).json({ success: false, error: 'Lead not found' });
//     }

//     logRequest('PATCH', `/api/leads/${phone}/interest`, 200);
//     sendSuccess(res, { data: result.rows[0] });
//   } catch (error) {
//     logRequest('PATCH', `/api/leads/${phone}/interest`, 500);
//     handleError(res, error);
//   }
// };

// /**
//  * Bulk import leads
//  */
// exports.bulkImportLeads = async (req, res) => {
//   try {
//     const { leads } = req.body;
    
//     if (!Array.isArray(leads) || leads.length === 0) {
//       return res.status(400).json({ error: 'leads array is required' });
//     }
    
//     const results = [];
//     const errors = [];
    
//     for (const lead of leads) {
//       try {
//         if (!lead.phone_number) {
//           errors.push({ lead: lead, error: 'phone_number is required' });
//           continue;
//         }

//         const query = `
//           INSERT INTO leads (
//             phone_number, name, email, lead_source, company_id,
//             chess_rating, location, interest_level
//           )
//           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
//           ON CONFLICT (phone_number) DO UPDATE
//           SET 
//             name = COALESCE(EXCLUDED.name, leads.name),
//             email = COALESCE(EXCLUDED.email, leads.email),
//             updated_at = CURRENT_TIMESTAMP
//           RETURNING *;
//         `;
        
//         const result = await pool.query(query, [
//           lead.phone_number,
//           lead.name || null,
//           lead.email || null,
//           lead.lead_source || 'import',
//           lead.company_id || null,
//           lead.chess_rating || null,
//           lead.location || null,
//           lead.interest_level || 1
//         ]);
        
//         results.push(result.rows[0]);
//       } catch (error) {
//         console.error(`Error importing lead ${lead.phone_number}:`, error.message);
//         errors.push({ phone: lead.phone_number, error: error.message });
//       }
//     }
    
//     logRequest('POST', '/api/leads/bulk', 200);
//     res.json({ 
//       success: true, 
//       imported: results.length,
//       failed: errors.length,
//       data: results,
//       errors: errors
//     });
//   } catch (error) {
//     console.error('Bulk import error:', error);
//     logRequest('POST', '/api/leads/bulk', 500);
//     handleError(res, error);
//   }
// };

// /**
//  * Search leads
//  */
// exports.searchLeads = async (req, res) => {
//   try {
//     const { query: searchQuery, status, source } = req.query;

//     let query = `SELECT * FROM leads WHERE 1=1`;
//     const params = [];
//     let paramCount = 0;

//     if (searchQuery) {
//       paramCount++;
//       query += ` AND (name ILIKE $${paramCount} OR phone_number ILIKE $${paramCount})`;
//       params.push(`%${searchQuery}%`);
//     }

//     if (status) {
//       paramCount++;
//       query += ` AND lead_status = $${paramCount}`;
//       params.push(status);
//     }

//     if (source) {
//       paramCount++;
//       query += ` AND lead_source = $${paramCount}`;
//       params.push(source);
//     }

//     query += ` ORDER BY updated_at DESC LIMIT 50;`;

//     const result = await pool.query(query, params);

//     logRequest('GET', '/api/search/leads', 200);
//     sendSuccess(res, { data: result.rows });
//   } catch (error) {
//     logRequest('GET', '/api/search/leads', 500);
//     handleError(res, error);
//   }
// };








const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');
const { normalizePhoneNumber } = require('../utils/helpers');

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