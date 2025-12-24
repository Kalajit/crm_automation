/**
 * Send success response
 * @param {object} res - Express response object
 * @param {object} data - Response data
 * @param {number} statusCode - HTTP status code
 */
const sendSuccess = (res, data = {}, statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    ...data
  });
};

/**
 * Send error response
 * @param {object} res - Express response object
 * @param {Error} error - Error object
 * @param {number} statusCode - HTTP status code
 */
const sendError = (res, error, statusCode = 500) => {
  console.error('Error:', error);
  res.status(statusCode).json({
    success: false,
    error: error.message || 'Internal Server Error'
  });
};

/**
 * Handle error with standardized response
 * @param {object} res - Express response object
 * @param {Error} error - Error object
 * @param {number} statusCode - HTTP status code
 */
const handleError = (res, error, statusCode = 500) => {
  sendError(res, error, statusCode);
};


/**
 * Success response with data
 * @param {object} res - Express response object
 * @param {object} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 */
const successResponse = (res, data = {}, message = 'Success', statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    message,
    data
  });
};


/**
 * Error response with message
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 */
const errorResponse = (res, message = 'Error', statusCode = 500) => {
  res.status(statusCode).json({
    success: false,
    error: message
  });
};


module.exports = {
  sendSuccess,
  sendError,
  handleError,
  successResponse,
  errorResponse
};