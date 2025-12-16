const rateLimit = require('express-rate-limit');
// const RedisStore = require('rate-limit-redis');
const { RedisStore } = require('rate-limit-redis');
const redis = require('redis');
const { errorResponse } = require('../utils/response');
const {logger} = require('../utils/logger');

// Create Redis client (optional - falls back to memory if Redis not available)
let redisClient = null;

try {
  if (process.env.REDIS_URL) {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            logger.warn('Redis connection failed, falling back to memory store');
            return new Error('Max retries reached');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
      redisClient = null; // Fall back to memory store
    });

    redisClient.connect().catch((err) => {
      logger.warn('Could not connect to Redis, using memory store:', err.message);
      redisClient = null;
    });
  }
} catch (error) {
  logger.warn('Redis initialization failed, using memory store:', error.message);
}

/**
 * Create a rate limiter with configurable options
 * @param {number} maxRequests - Maximum number of requests
 * @param {number} windowSeconds - Time window in seconds
 * @param {object} options - Additional options
 */
const rateLimiter = (maxRequests = 100, windowSeconds = 60, options = {}) => {
  const config = {
    windowMs: windowSeconds * 1000,
    max: maxRequests,
    message: {
      success: false,
      message: `Too many requests. Please try again after ${windowSeconds} seconds.`,
      error: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      return errorResponse(
        res, 
        `Too many requests. Please try again after ${windowSeconds} seconds.`, 
        429
      );
    },
    skip: (req) => {
      // Skip rate limiting for specific IPs (e.g., internal services)
      const whitelistedIPs = (process.env.RATE_LIMIT_WHITELIST || '').split(',');
      return whitelistedIPs.includes(req.ip);
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP
      return req.user?.id?.toString() || req.ip;
    },
    ...options
  };

  // Use Redis store if available, otherwise use memory store
  if (redisClient && redisClient.isOpen) {
    config.store = new RedisStore({
      client: redisClient,
      prefix: 'rl:',
      sendCommand: (...args) => redisClient.sendCommand(args)
    });
  } else {
    logger.info('Using memory store for rate limiting');
  }

  return rateLimit(config);
};

/**
 * Strict rate limiter for sensitive operations
 */
const strictRateLimiter = rateLimiter(10, 60, {
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

/**
 * Moderate rate limiter for API calls
 */
const apiRateLimiter = rateLimiter(100, 60);

/**
 * Loose rate limiter for public endpoints
 */
const publicRateLimiter = rateLimiter(200, 60);

/**
 * Custom rate limiter based on company subscription
 */
const subscriptionRateLimiter = async (req, res, next) => {
  try {
    const companyId = req.body.company_id || req.query.company_id || req.user?.company_id;

    if (!companyId) {
      return next(); // No company ID, use default rate limit
    }

    // Get company's plan limits from database
    const pool = require('../config/database');
    const result = await pool.query(`
      SELECT 
        bp.max_api_requests_per_hour
      FROM company_subscriptions cs
      JOIN company_billing_plans bp ON cs.plan_id = bp.id
      WHERE cs.company_id = $1 AND cs.status = 'active'
    `, [companyId]);

    if (result.rows.length === 0) {
      return next(); // No active subscription, use default
    }

    const maxRequests = result.rows[0].max_api_requests_per_hour || 1000;

    // Apply company-specific rate limit
    const limiter = rateLimiter(maxRequests, 3600); // per hour
    return limiter(req, res, next);
  } catch (error) {
    logger.error('Subscription rate limiter error:', error);
    return next(); // On error, continue without rate limiting
  }
};

/**
 * Webhook rate limiter (more permissive for external services)
 */
const webhookRateLimiter = rateLimiter(500, 60, {
  keyGenerator: (req) => {
    // Use webhook token or IP
    return req.body.webhook_token || req.headers['x-webhook-signature'] || req.ip;
  }
});

module.exports = {
  rateLimiter,
  strictRateLimiter,
  apiRateLimiter,
  publicRateLimiter,
  subscriptionRateLimiter,
  webhookRateLimiter
};