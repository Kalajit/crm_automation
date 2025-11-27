const { logRequest } = require('../utils/logger');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  logRequest(req.method, req.path, statusCode);

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = {
  errorHandler
};