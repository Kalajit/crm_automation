const pool = require('../config/database');
const axios = require('axios');

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
      
      if (platform === 'meta' || platform === 'linkedin') {
        console.warn(`⚠️ ${platform} token expiring soon. User needs to re-authorize.`);
      }
    }
    
    return creds.access_token;
  } catch (error) {
    console.error(`❌ Token check/refresh failed for ${platform}:`, error.message);
    return null;
  }
}

module.exports = { checkAndRefreshToken };