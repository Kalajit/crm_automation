// src/routes/usageTracking.routes.js
const express = require('express');
const router = express.Router();
const usageTrackingController = require('../controllers/usageTracking.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { rateLimiter } = require('../middleware/rateLimiter.middleware');

// ============================================
// PUBLIC ROUTES (with rate limiting)
// ============================================

/**
 * Track a usage event
 * POST /api/usage/track
 * Body: { company_id, event_type, quantity, metadata }
 */
router.post(
  '/track',
  rateLimiter(100, 60), // 100 requests per minute
  usageTrackingController.trackUsage
);

/**
 * Check if company has reached usage limit
 * GET /api/usage/check-limit?company_id=1&event_type=whatsapp_message
 */
router.get(
  '/check-limit',
  rateLimiter(200, 60),
  usageTrackingController.checkUsageLimit
);

// ============================================
// PROTECTED ROUTES (requires authentication)
// ============================================

/**
 * Get usage report for a company
 * GET /api/usage/report?company_id=1&period=current
 * Query params: company_id, start_date, end_date, period (current/last_month/last_3_months)
 */
router.get(
  '/report',
  authMiddleware,
  rateLimiter(50, 60),
  usageTrackingController.getUsageReport
);

/**
 * Get detailed usage analytics
 * GET /api/usage/analytics?company_id=1&months=6
 * Query params: company_id, months (default: 6)
 */
router.get(
  '/analytics',
  authMiddleware,
  rateLimiter(50, 60),
  usageTrackingController.getUsageAnalytics
);

/**
 * Get usage events history
 * GET /api/usage/events?company_id=1&event_type=whatsapp_message&limit=100&offset=0
 * Query params: company_id, event_type, limit, offset, start_date, end_date
 */
router.get(
  '/events',
  authMiddleware,
  rateLimiter(50, 60),
  usageTrackingController.getUsageEvents
);

/**
 * Get usage alerts (warnings about approaching limits)
 * GET /api/usage/alerts?company_id=1
 */
router.get(
  '/alerts',
  authMiddleware,
  rateLimiter(50, 60),
  usageTrackingController.getUsageAlerts
);

// ============================================
// ADMIN ONLY ROUTES
// ============================================

/**
 * Reset usage for a company (Admin only)
 * POST /api/usage/reset
 * Body: { company_id }
 * Requires: Admin role in the company
 */
router.post(
  '/reset',
  authMiddleware, // User must be authenticated
  rateLimiter(10, 60), // Strict rate limit for admin actions
  usageTrackingController.resetUsage
);

module.exports = router;