const pool = require('../config/database');
const axios = require('axios');
const crypto = require('crypto');
const { handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');
const { 
  encryptToken, 
  decryptToken, 
  getValidAccessToken,
  refreshGmailToken,
  refreshOutlookToken 
} = require('../utils/encryption');
const { 
  extractLeadFromEmail,
  fetchGmailEmails,
  fetchOutlookEmails,
  processEmailForLead
} = require('../services/email/emailService');

// ============================================
// EMAIL CONFIGURATION MANAGEMENT
// ============================================

exports.createEmailConfig = async (req, res) => {
  try {
    const {
      company_id,
      email_address,
      provider,
      imap_host,
      imap_port,
      imap_username,
      imap_password,
      scan_folders,
      ai_rules
    } = req.body;

    if (!company_id || !email_address || !provider) {
      return res.status(400).json({ 
        error: 'company_id, email_address, and provider are required' 
      });
    }

    const encryptedPassword = imap_password ? encryptToken(imap_password) : null;

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
      encryptedPassword,
      scan_folders || ['INBOX'],
      JSON.stringify(ai_rules || {})
    ]);

    logRequest('POST', '/api/email/config', 201);
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Email configuration saved. Scanning will start automatically.'
    });
  } catch (error) {
    logRequest('POST', '/api/email/config', 500);
    handleError(res, error);
  }
};

exports.getEmailConfigs = async (req, res) => {
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

    logRequest('GET', `/api/email/config/${company_id}`, 200);
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logRequest('GET', `/api/email/config/${req.params.company_id}`, 500);
    handleError(res, error);
  }
};

exports.toggleEmailConfig = async (req, res) => {
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

    logRequest('PATCH', `/api/email/config/${id}/toggle`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logRequest('PATCH', `/api/email/config/${req.params.id}/toggle`, 500);
    handleError(res, error);
  }
};

exports.deleteEmailConfig = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM email_configs WHERE id = $1', [id]);

    logRequest('DELETE', `/api/email/config/${id}`, 200);
    res.json({
      success: true,
      message: 'Email configuration deleted'
    });
  } catch (error) {
    logRequest('DELETE', `/api/email/config/${req.params.id}`, 500);
    handleError(res, error);
  }
};

// ============================================
// EMAIL PROCESSING
// ============================================

exports.processEmail = async (req, res) => {
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
      return res.status(400).json({ 
        error: 'company_id and email_body are required' 
      });
    }

    const extractedData = await extractLeadFromEmail({
      from: email_from,
      subject: email_subject,
      body: email_body,
      company_id: company_id
    });

    if (!extractedData.phone_number && !extractedData.email) {
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

    let phone = extractedData.phone_number;
    if (phone) {
      phone = phone.replace(/\D/g, '');
      if (phone.length === 10) phone = '+91' + phone;
      else if (!phone.startsWith('+')) phone = '+' + phone;
    }

    let leadId;
    const existingLead = await pool.query(
      'SELECT id FROM leads WHERE phone_number = $1 OR email = $2',
      [phone, extractedData.email]
    );

    if (existingLead.rows.length > 0) {
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
};

exports.getScanLogs = async (req, res) => {
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
    logRequest('GET', `/api/email/scan-logs/${req.params.company_id}`, 500);
    handleError(res, error);
  }
};

// ============================================
// GMAIL OAUTH
// ============================================

exports.startGmailOAuth = async (req, res) => {
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
};

exports.handleGmailCallback = async (req, res) => {
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
};

// ============================================
// OUTLOOK OAUTH
// ============================================

exports.startOutlookOAuth = async (req, res) => {
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
};

exports.handleOutlookCallback = async (req, res) => {
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
};

// ============================================
// EMAIL STATUS & MANAGEMENT
// ============================================

exports.getEmailStatus = async (req, res) => {
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
    logRequest('GET', `/api/email/status/${req.params.company_id}`, 500);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

exports.disconnectEmail = async (req, res) => {
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
};

exports.scanCompanyEmails = async (req, res) => {
  try {
    const { company_id } = req.params;
    
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
        
        const accessToken = await getValidAccessToken(config);
        
        let emails = [];
        
        if (config.provider === 'gmail') {
          emails = await fetchGmailEmails(accessToken, config);
        } else if (config.provider === 'outlook') {
          emails = await fetchOutlookEmails(accessToken, config);
        }
        
        console.log(`Found ${emails.length} unread emails for ${config.email_address}`);
        
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
        logRequest('POST', `/api/email/scan/${req.params.company_id}`, 500);
        res.status(500).json({
        success: false,
        error: error.message
        });
    }
};