/**
 * Validation middleware for auth endpoints
 */

const validateRegistration = (req, res, next) => {
  const { company_name, email, password, first_name, last_name } = req.body;

  const errors = [];

  // Company name validation
  if (!company_name || company_name.trim().length < 2) {
    errors.push('Company name must be at least 2 characters');
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    errors.push('Valid email is required');
  }

  // Password validation
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  // Name validation
  if (!first_name || first_name.trim().length < 2) {
    errors.push('First name must be at least 2 characters');
  }

  if (!last_name || last_name.trim().length < 2) {
    errors.push('Last name must be at least 2 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  const errors = [];

  if (!email) {
    errors.push('Email is required');
  }

  if (!password) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

module.exports = {
  validateRegistration,
  validateLogin
};