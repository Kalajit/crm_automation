/**
 * Normalize phone number to ensure it starts with '+'
 * @param {string} phone - Phone number
 * @returns {string} - Normalized phone number
 */
const normalizePhoneNumber = (phone) => {
  if (!phone) return phone;
  
  // Remove any spaces or special characters except +
  phone = phone.trim();
  
  // Ensure it starts with '+'
  if (!phone.startsWith('+')) {
    return `+${phone}`;
  }
  
  return phone;
};

/**
 * Generate unique ID
 * @returns {string} - Unique ID
 */
const generateUniqueId = () => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Parse JSON safely
 * @param {string} jsonString - JSON string to parse
 * @param {any} defaultValue - Default value if parsing fails
 * @returns {any} - Parsed object or default value
 */
const parseJsonSafely = (jsonString, defaultValue = null) => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('JSON parse error:', error.message);
    return defaultValue;
  }
};

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} - True if valid
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Format date to ISO string
 * @param {Date|string} date - Date object or string
 * @returns {string} - ISO formatted date string
 */
const formatDateISO = (date) => {
  if (!date) return null;
  return new Date(date).toISOString();
};

/**
 * Sleep/delay function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after delay
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

module.exports = {
  normalizePhoneNumber,
  generateUniqueId,
  parseJsonSafely,
  isValidEmail,
  formatDateISO,
  sleep
};