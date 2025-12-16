const axios = require('axios');

async function detectLanguage(text) {
  try {
    const response = await axios.post(
      'https://translation.googleapis.com/language/translate/v2/detect',
      {
        q: text
      },
      {
        params: {
          key: process.env.GOOGLE_TRANSLATE_API_KEY
        }
      }
    );
    
    return response.data.data.detections[0][0].language;
  } catch (error) {
    console.error('Language detection error:', error);
    return 'en';
  }
}

async function translateText(text, targetLang, sourceLang = 'en') {
  if (targetLang === sourceLang) {
    return text;
  }
  
  try {
    const response = await axios.post(
      'https://translation.googleapis.com/language/translate/v2',
      {
        q: text,
        source: sourceLang,
        target: targetLang,
        format: 'text'
      },
      {
        params: {
          key: process.env.GOOGLE_TRANSLATE_API_KEY
        }
      }
    );
    
    return response.data.data.translations[0].translatedText;
  } catch (error) {
    console.error('Translation error:', error);
    return text;
  }
}

module.exports = {
  detectLanguage,
  translateText
};