const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { errorResponse } = require('../utils/response');
const {logger} = require('../utils/logger');




const JWT_SECRET = process.env.JWT_SECRET_KEY || 'your-secret-key-change-in-production';

/**
 * Authenticate JWT token middleware
 */
const authenticateToken = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
        error: 'UNAUTHORIZED'
      });
    }

    // Verify token
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        logger.warn(`Invalid token attempt: ${err.message}`, {
          ip: req.ip,
          path: req.path
        });
        
        return res.status(403).json({
          success: false,
          message: err.name === 'TokenExpiredError' 
            ? 'Token expired. Please login again.' 
            : 'Invalid token',
          error: 'FORBIDDEN'
        });
      }

      // Attach user info to request
      req.user = decoded;
      
      logger.debug('User authenticated', {
        user_id: decoded.user_id,
        company_id: decoded.company_id,
        path: req.path
      });
      
      next();
    });

  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        req.user = null;
      } else {
        req.user = decoded;
      }
      next();
    });

  } catch (error) {
    req.user = null;
    next();
  }
};

/**
 * Check if user has specific role
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Insufficient permissions', {
        user_id: req.user.user_id,
        user_role: req.user.role,
        required_roles: roles
      });
      
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Required role: ${roles.join(' or ')}`
      });
    }

    next();
  };
};

/**
 * Check if user belongs to company
 */
const requireCompanyAccess = (req, res, next) => {
  try {
    const requestedCompanyId = parseInt(
      req.params.company_id || 
      req.params.companyId || 
      req.body.company_id || 
      req.query.company_id
    );

    if (!requestedCompanyId) {
      return res.status(400).json({
        success: false,
        message: 'company_id is required'
      });
    }

    // Service accounts and admins can access all companies
    if (req.user.role === 'service' || req.user.role === 'admin') {
      return next();
    }

    // Regular users can only access their own company
    if (req.user.company_id !== requestedCompanyId) {
      logger.warn('Unauthorized company access attempt', {
        user_id: req.user.user_id,
        user_company: req.user.company_id,
        requested_company: requestedCompanyId
      });
      
      return res.status(403).json({
        success: false,
        message: 'Access denied to this company'
      });
    }

    next();
  } catch (error) {
    logger.error('Company access middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authorization error'
    });
  }
};


/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 'No token provided. Authorization required.', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return errorResponse(res, 'Token expired. Please login again.', 401);
      }
      return errorResponse(res, 'Invalid token. Authentication failed.', 401);
    }

    // Get user from database
    const userResult = await pool.query(
      'SELECT id, email, role, company_id, name FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return errorResponse(res, 'User not found. Authentication failed.', 401);
    }

    // Attach user to request
    req.user = userResult.rows[0];
    
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return errorResponse(res, 'Authentication error', 500);
  }
};

/**
 * Admin-only middleware
 * Must be used after authMiddleware
 */
const adminMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      return errorResponse(res, 'Authentication required', 401);
    }

    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      logger.warn('Unauthorized admin access attempt', { 
        userId: req.user.id, 
        role: req.user.role 
      });
      return errorResponse(res, 'Admin access required', 403);
    }

    next();
  } catch (error) {
    logger.error('Admin middleware error:', error);
    return errorResponse(res, 'Authorization error', 500);
  }
};

/**
 * Company access middleware
 * Verifies user has access to the requested company
 */
const companyAccessMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      return errorResponse(res, 'Authentication required', 401);
    }

    // Get company_id from request (body, params, or query)
    const companyId = req.body.company_id || req.params.company_id || req.query.company_id;

    if (!companyId) {
      return errorResponse(res, 'company_id is required', 400);
    }

    // Super admin can access any company
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Regular users can only access their own company
    if (req.user.company_id !== parseInt(companyId)) {
      logger.warn('Unauthorized company access attempt', {
        userId: req.user.id,
        userCompanyId: req.user.company_id,
        requestedCompanyId: companyId
      });
      return errorResponse(res, 'Access denied to this company', 403);
    }

    next();
  } catch (error) {
    logger.error('Company access middleware error:', error);
    return errorResponse(res, 'Authorization error', 500);
  }
};

/**
 * Optional auth middleware
 * Attaches user if token is provided, but doesn't require it
 */
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // No token provided, continue without user
    }

    const token = authHeader.substring(7);
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      const userResult = await pool.query(
        'SELECT id, email, role, company_id, name FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length > 0) {
        req.user = userResult.rows[0];
      }
    } catch (error) {
      // Invalid token, but continue without user
      logger.warn('Invalid token in optional auth', { error: error.message });
    }

    next();
  } catch (error) {
    logger.error('Optional auth middleware error:', error);
    next(); // Continue even if there's an error
  }
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  companyAccessMiddleware,
  optionalAuthMiddleware,
  authenticateToken,
  optionalAuth,
  requireRole,
  requireCompanyAccess
};