const translate = require('../../config/translation');
const { LANGUAGE_MAP, LANGUAGE_KEYWORDS } = require('../../config/constants');

/**
 * Translate text from source language to target language
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code
 * @param {string|null} sourceLang - Source language code (optional)
 * @returns {Promise<string>} - Translated text
 */
async function translateText(text, targetLang, sourceLang = null) {
  if (!text || !text.trim()) {
    return text;
  }

  // No translation needed
  if (sourceLang === targetLang) {
    return text;
  }

  try {
    const options = {
      to: targetLang
    };
    
    if (sourceLang) {
      options.from = sourceLang;
    }

    const [translation] = await translate.translate(text, options);
    console.log(`✅ Translated: ${text.substring(0, 50)}... → ${translation.substring(0, 50)}...`);
    return translation;
  } catch (error) {
    console.error('❌ Translation failed:', error);
    return text; // Return original text on failure
  }
}

/**
 * Detect language from text
 * @param {string} text - Text to detect language from
 * @returns {Promise<string>} - Detected language code
 */
async function detectLanguage(text) {
  if (!text || text.trim().length < 3) {
    return 'en';
  }

  // Check for explicit language keywords first
  const textLower = text.toLowerCase();
  for (const [langCode, keywords] of Object.entries(LANGUAGE_KEYWORDS)) {
    if (keywords.some(keyword => textLower.includes(keyword))) {
      console.log(`🔍 Detected language via keyword: ${langCode}`);
      return langCode;
    }
  }

  try {
    const [detection] = await translate.detect(text);
    const detectedLang = detection.language;
    const confidence = detection.confidence;

    if (LANGUAGE_MAP[detectedLang]) {
      console.log(`🔍 Detected language: ${detectedLang} (confidence: ${confidence.toFixed(2)})`);
      return detectedLang;
    } else {
      console.log(`⚠️ Unsupported language detected: ${detectedLang}, defaulting to English`);
      return 'en';
    }
  } catch (error) {
    console.error('❌ Language detection failed:', error);
    return 'en';
  }
}

/**
 * Translate multiple texts in batch
 * @param {string[]} texts - Array of texts to translate
 * @param {string} targetLang - Target language code
 * @param {string} sourceLang - Source language code
 * @returns {Promise<string[]>} - Array of translated texts
 */
async function translateBatch(texts, targetLang, sourceLang = 'en') {
  if (targetLang === sourceLang || !texts || texts.length === 0) {
    return texts;
  }
  
  try {
    console.log(`🌐 Batch translating ${texts.length} texts: ${sourceLang} → ${targetLang}`);
    
    // Join texts with delimiter for batch processing
    const combinedText = texts.join(' ||| ');
    const translated = await translateText(combinedText, targetLang, sourceLang);
    
    // Split back
    const translatedTexts = translated.split(' ||| ');
    
    // Validate lengths match
    if (translatedTexts.length === texts.length) {
      console.log(`✅ Batch translation complete: ${texts.length} texts`);
      return translatedTexts;
    } else {
      console.warn(`⚠️ Batch translation length mismatch, falling back to individual`);
      // Fallback to individual translations
      return await Promise.all(
        texts.map(text => translateText(text, targetLang, sourceLang))
      );
    }
    
  } catch (error) {
    console.error(`❌ Batch translation error: ${error.message}`);
    // Fallback to individual translations
    return await Promise.all(
      texts.map(text => translateText(text, targetLang, sourceLang))
    );
  }
}

module.exports = {
  detectLanguage,
  translateText,
  translateBatch
};