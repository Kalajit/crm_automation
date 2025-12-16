const crypto = require('crypto');
const pool = require('../config/database');
const axios = require('axios');

const algorithm = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 32 bytes (32 chars)');
}
const KEY = Buffer.from(ENCRYPTION_KEY, 'utf8');

const FIXED_IV = crypto.randomBytes(16);

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

async function getValidAccessToken(config) {
  const now = new Date();
  const expiresAt = new Date(config.oauth_token_expires_at);
  
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

module.exports = {
  encryptToken,
  decryptToken,
  refreshGmailToken,
  refreshOutlookToken,
  getValidAccessToken
};