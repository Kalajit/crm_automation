// src/controllers/leadSources.controller.js

const pool = require('../config/database');
const axios = require('axios');

// --------------------------------------------------------
// CONFIGURE LEAD SOURCE
// --------------------------------------------------------
exports.configureLeadSource = async (req, res) => {
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

    const webhookToken = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const webhookUrl = `${process.env.BASE_URL}/api/webhooks/lead-capture/${webhookToken}`;

    const result = await pool.query(
      `
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
      `,
      [company_id, platform, form_id, form_name, JSON.stringify(field_mappings), webhookUrl]
    );

    return res.json({ success: true, data: result.rows[0] });

  } catch (error) {
    console.error('Configure lead source error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// --------------------------------------------------------
// GET LEAD SOURCE CONFIGS
// --------------------------------------------------------
exports.getLeadSourceConfigs = async (req, res) => {
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

    return res.json({ success: true, data: result.rows });

  } catch (error) {
    console.error('Get lead source configs error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// --------------------------------------------------------
// GET META FORMS (FACEBOOK LEAD ADS)
// --------------------------------------------------------
exports.getMetaForms = async (req, res) => {
  try {
    const { company_id } = req.params;

    const creds = await pool.query(
      `
      SELECT access_token, account_id 
      FROM oauth_credentials 
      WHERE company_id = $1 AND platform = 'meta'
      `,
      [company_id]
    );

    if (creds.rows.length === 0) {
      return res.status(404).json({ error: 'Meta credentials not found' });
    }

    const { access_token, account_id } = creds.rows[0];

    const formsResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${account_id}/leadgen_forms`,
      {
        params: {
          access_token,
          fields: 'id,name,status,leads_count,questions'
        }
      }
    );

    return res.json({ success: true, forms: formsResponse.data.data });

  } catch (error) {
    console.error('Get Meta forms error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// --------------------------------------------------------
// IMPORT STATS
// --------------------------------------------------------
exports.getImportStats = async (req, res) => {
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

    query += `
      GROUP BY platform, status, DATE(created_at)
      ORDER BY date DESC
    `;

    const result = await pool.query(query, params);

    return res.json({ success: true, data: result.rows });

  } catch (error) {
    console.error('Get import stats error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// --------------------------------------------------------
// RETRY FAILED IMPORT
// --------------------------------------------------------
exports.retryFailedImport = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { log_id } = req.params;

    const logResult = await client.query(
      `
      SELECT * FROM lead_import_logs 
      WHERE id = $1 AND status = 'failed'
      `,
      [log_id]
    );

    if (logResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Failed import not found' });
    }

    const log = logResult.rows[0];

    const configResult = await client.query(
      `
      SELECT * FROM lead_source_configs
      WHERE company_id = $1 AND platform = $2 AND form_id = $3
      `,
      [log.company_id, log.platform, log.form_id]
    );

    if (configResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lead source config not found' });
    }

    const config = configResult.rows[0];
    const mappedData = log.mapped_data;
    const rawData = log.raw_data;

    const phone =
      mappedData.phone_number ||
      mappedData.phone ||
      null;

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

    await client.query(
      `
      UPDATE lead_import_logs 
      SET status = 'success', lead_id = $1 
      WHERE id = $2
      `,
      [leadId, log_id]
    );

    await client.query('COMMIT');

    return res.json({ success: true, lead_id: leadId });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Retry import error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};




exports.getConfigByToken = async (req, res) => {
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
};