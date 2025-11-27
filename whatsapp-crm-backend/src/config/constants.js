// Language mappings
const LANGUAGE_MAP = {
  'en': 'English',
  'hi': 'Hindi',
  'kn': 'Kannada',
  'ml': 'Malayalam',
  'ta': 'Tamil',
  'te': 'Telugu'
};

const LANGUAGE_KEYWORDS = {
  'hi': ['hindi', 'hindi mein', 'हिंदी', 'hindi me bolo', 'speak hindi', 'हिन्दी में'],
  'kn': ['kannada', 'kannada mein', 'ಕನ್ನಡ', 'kannada nalli', 'speak kannada', 'ಕನ್ನಡದಲ್ಲಿ'],
  'ml': ['malayalam', 'malayalam il', 'മലയാളം', 'malayalam parayamo', 'speak malayalam', 'മലയാളത്തിൽ'],
  'ta': ['tamil', 'tamil la', 'தமிழ்', 'tamil paesu', 'speak tamil', 'தமிழில்'],
  'te': ['telugu', 'telugu lo', 'తెలుగు', 'telugu cheppu', 'speak telugu', 'తెలుగులో'],
  'en': ['english', 'english mein', 'speak english', 'english please', 'talk in english']
};

// Rate limit configurations
const RATE_LIMITS = {
  // Per company limits
  company: {
    messages_per_minute: 20,
    messages_per_hour: 1000,
    messages_per_day: 10000
  },
  // Per phone number limits (to avoid spam)
  recipient: {
    messages_per_hour: 10,
    messages_per_day: 50
  },
  // Bulk message limits
  bulk: {
    batch_size: 50,
    delay_between_batches_ms: 2000,
    max_concurrent_batches: 3
  }
};

// API URLs
const API_URLS = {
  INDICTRANS: process.env.INDICTRANS_URL || 'http://indictrans:5000',
  DEEPL_API_KEY: process.env.DEEPL_API_KEY || null
};

// Webhook configuration
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

module.exports = {
  LANGUAGE_MAP,
  LANGUAGE_KEYWORDS,
  RATE_LIMITS,
  API_URLS,
  WEBHOOK_VERIFY_TOKEN
};