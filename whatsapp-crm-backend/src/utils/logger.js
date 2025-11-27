/**
 * Log HTTP request with timestamp
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @param {number} status - HTTP status code
 */
const logRequest = (method, path, status) => {
  const timestamp = new Date().toISOString();
  const statusEmoji = status >= 500 ? '❌' : status >= 400 ? '⚠️' : '✓';
  console.log(`${statusEmoji} [${timestamp}] ${method} ${path} - ${status}`);
};

/**
 * Log info message
 * @param {string} message - Message to log
 * @param {object} data - Additional data
 */
const logInfo = (message, data = {}) => {
  console.log(`ℹ️ [${new Date().toISOString()}] ${message}`, data);
};

/**
 * Log error message
 * @param {string} message - Error message
 * @param {Error} error - Error object
 */
const logError = (message, error = null) => {
  console.error(`❌ [${new Date().toISOString()}] ${message}`);
  if (error) {
    console.error('Error details:', error);
  }
};

/**
 * Log warning message
 * @param {string} message - Warning message
 * @param {object} data - Additional data
 */
const logWarning = (message, data = {}) => {
  console.warn(`⚠️ [${new Date().toISOString()}] ${message}`, data);
};

module.exports = {
  logRequest,
  logInfo,
  logError,
  logWarning
};