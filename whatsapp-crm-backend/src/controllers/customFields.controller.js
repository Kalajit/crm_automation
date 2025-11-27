const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Get extraction templates
 */
exports.getExtractionTemplates = async (req, res) => {
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
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/extraction-templates', 500);
    handleError(res, error);
  }
};

/**
 * Apply template to company
 */
exports.applyTemplate = async (req, res) => {
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
        company_id, agent_instance_id || null,
        field.field_key, field.field_label, field.field_type,
        field.field_category, field.is_required || false,
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
};

/**
 * Get custom field definitions for company
 */
exports.getCustomFieldDefinitions = async (req, res) => {
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
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/custom-fields/${company_id}`, 500);
    handleError(res, error);
  }
};

/**
 * Create or update field definition
 */
exports.createOrUpdateFieldDefinition = async (req, res) => {
  try {
    const {
      company_id, agent_instance_id, field_key, field_label,
      field_type, field_category, is_required,
      validation_rules, extraction_config
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
      company_id, agent_instance_id || null, field_key, field_label,
      field_type, field_category || 'general', is_required || false,
      validation_rules ? JSON.stringify(validation_rules) : null,
      extraction_config ? JSON.stringify(extraction_config) : null
    ]);
    
    logRequest('POST', '/api/custom-fields', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/custom-fields', 500);
    handleError(res, error);
  }
};

/**
 * Save extracted custom data for lead
 */
exports.saveLeadCustomData = async (req, res) => {
  try {
    const { lead_id } = req.params;
    const { custom_data, source, confidence_scores } = req.body;
    
    if (!custom_data || typeof custom_data !== 'object') {
      return res.status(400).json({ error: 'custom_data object is required' });
    }
    
    const saved = [];
    
    for (const [field_key, field_value] of Object.entries(custom_data)) {
      if (!field_value) continue;
      
      // Get field definition
      const fieldDef = await pool.query(
        'SELECT id FROM custom_field_definitions WHERE field_key = $1 AND is_active = TRUE LIMIT 1',
        [field_key]
      );
      
      if (fieldDef.rows.length === 0) continue;
      
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
        lead_id, field_definition_id, field_key,
        field_value, normalized,
        source || 'ai_extraction', confidence
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
};

/**
 * Get lead custom data
 */
exports.getLeadCustomData = async (req, res) => {
  try {
    const { lead_id } = req.params;
    
    const query = `
      SELECT 
        lcd.*, cfd.field_label, cfd.field_type, cfd.field_category
      FROM lead_custom_data lcd
      JOIN custom_field_definitions cfd ON lcd.field_definition_id = cfd.id
      WHERE lcd.lead_id = $1
      ORDER BY cfd.display_order, cfd.field_label;
    `;
    
    const result = await pool.query(query, [lead_id]);
    
    logRequest('GET', `/api/leads/${lead_id}/custom-data`, 200);
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/leads/${lead_id}/custom-data`, 500);
    handleError(res, error);
  }
};

/**
 * Search leads by custom field
 */
exports.searchByCustomField = async (req, res) => {
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
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/leads/search-by-custom-field', 500);
    handleError(res, error);
  }
};