const pool = require('../../config/database');
const { detectLanguage, translateText } = require('../translation/translationService');
const axios = require('axios');

async function handleMultilingualWhatsAppMessage(message, agentInstance, fromPhone) {
  try {
    const leadResult = await pool.query(
      'SELECT preferred_language FROM leads WHERE phone_number = $1',
      [fromPhone]
    );
    
    const preferredLang = leadResult.rows[0]?.preferred_language || 'en';
    const detectedLang = await detectLanguage(message);

    if (detectedLang !== preferredLang && detectedLang !== 'en') {
      await pool.query(
        'UPDATE leads SET preferred_language = $1 WHERE phone_number = $2',
        [detectedLang, fromPhone]
      );
      console.log(`🔄 Language updated: ${preferredLang} → ${detectedLang} for ${fromPhone}`);
    }
    
    const activeLang = detectedLang !== 'en' ? detectedLang : preferredLang;

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

async function sendWhatsAppResponse(agentInstance, toPhone, message, leadLanguage = 'en') {
  try {
    const credentials = agentInstance.whatsapp_credentials;

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

module.exports = {
  handleMultilingualWhatsAppMessage,
  sendWhatsAppResponse
};