const pool = require('../config/database');
const axios = require('axios');
const { handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

// ============================================
// META/FACEBOOK OAUTH
// ============================================

exports.startMetaOAuth = async (req, res) => {
  try {
    const { company_id } = req.query;
    
    if (!company_id) {
      return res.status(400).json({ error: 'company_id required' });
    }
    
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
      `scope=ads_read,leads_retrieval,business_management,pages_show_list,pages_read_engagement,ads_management&` +
      `response_type=code`;
    
    res.json({ success: true, auth_url: authUrl });
  } catch (error) {
    console.error('Meta OAuth start error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.handleMetaCallback = async (req, res) => {
  try {
    const { code, state, error: oauth_error } = req.query;
    
    if (oauth_error) {
      return res.status(400).send(`OAuth Error: ${oauth_error}`);
    }
    
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { company_id } = stateData;
    
    const redirectUri = `${process.env.BASE_URL}/api/oauth/meta/callback`;
    
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
    
    const { access_token, expires_in } = tokenResponse.data;
    
    const accountsResponse = await axios.get(
      'https://graph.facebook.com/v21.0/me/adaccounts',
      {
        params: {
          access_token: access_token,
          fields: 'id,name,account_status,currency,timezone_name'
        }
      }
    );
    
    const accounts = accountsResponse.data.data;
    
    if (accounts.length === 0) {
      return res.status(400).send('No ad accounts found');
    }
    
    const primaryAccount = accounts[0];

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
    `, [
      company_id, 
      access_token, 
      primaryAccount.id, 
      primaryAccount.name, 
      expires_in, 
      ['ads_read', 'leads_retrieval', 'business_management']
    ]);
    
    for (const form of forms) {
      await configureMetaFormWebhook(company_id, form.id, form.name, access_token);
    }
    
    logRequest('GET', '/api/oauth/meta/callback', 200);
    
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
    logRequest('GET', '/api/oauth/meta/callback', 500);
    res.status(500).send(generateErrorPage('Connection Failed', error.message));
  }
};

async function configureMetaFormWebhook(company_id, form_id, form_name, access_token) {
  try {
    const webhookToken = `meta_${company_id}_${form_id}_${Date.now()}`;
    const webhookUrl = `${process.env.BASE_URL}/api/webhooks/meta-leads/${webhookToken}`;
    
    await axios.post(
      `https://graph.facebook.com/v21.0/${form_id}/subscribed_apps`,
      null,
      {
        params: { access_token: access_token }
      }
    );
    
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

exports.getMetaForms = async (req, res) => {
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
    logRequest('GET', `/api/oauth/meta/forms/${req.params.company_id}`, 500);
    res.status(500).json({ error: error.message });
  }
};

exports.syncMetaLeads = async (req, res) => {
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
};

// ============================================
// GOOGLE ADS OAUTH
// ============================================

exports.startGoogleAdsOAuth = async (req, res) => {
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
};

exports.handleGoogleAdsCallback = async (req, res) => {
  try {
    const { code, state, error: oauth_error } = req.query;
    
    if (oauth_error) {
      return res.status(400).send(`OAuth Error: ${oauth_error}`);
    }
    
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { company_id } = stateData;
    
    const redirectUri = `${process.env.BASE_URL}/api/oauth/google-ads/callback`;
    
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
};

// ============================================
// LINKEDIN OAUTH
// ============================================

exports.startLinkedInOAuth = async (req, res) => {
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
};

exports.handleLinkedInCallback = async (req, res) => {
  try {
    const { code, state, error: oauth_error } = req.query;
    
    if (oauth_error) {
      return res.status(400).send(`OAuth Error: ${oauth_error}`);
    }
    
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { company_id } = stateData;
    
    const redirectUri = `${process.env.BASE_URL}/api/oauth/linkedin/callback`;
    
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
};

// ============================================
// GENERAL OAUTH FUNCTIONS
// ============================================

exports.getOAuthStatus = async (req, res) => {
  try {
    const { company_id } = req.params;

    const result = await pool.query(
      `SELECT platform, account_id, account_name,
             token_expires_at, is_active,
             EXTRACT(DAY FROM (token_expires_at - NOW())) AS days_until_expiry
      FROM oauth_credentials
      WHERE company_id = $1
      ORDER BY platform`,
      [company_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get OAuth status error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.disconnectPlatform = async (req, res) => {
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
};

// Helper function
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