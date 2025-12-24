// // src/controllers/usageTracking.controller.js
// const pool = require('../config/database');
// const usageTrackingService = require('../services/usageTracking/usageTracking.service');
// const { successResponse, errorResponse } = require('../utils/response');
// const logger = require('../utils/logger');

// // ============================================
// // USAGE TRACKING
// // ============================================

// exports.trackUsage = async (req, res) => {
//   try {
//     const { company_id, event_type, quantity = 1, metadata = {} } = req.body;

//     if (!company_id || !event_type) {
//       return errorResponse(res, 'company_id and event_type are required', 400);
//     }

//     await usageTrackingService.trackUsage(company_id, event_type, quantity, metadata);

//     logger.info('POST', '/api/usage/track', 200);
//     return successResponse(res, null, 'Usage tracked successfully');
//   } catch (error) {
//     logger.error('Track usage error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// exports.checkUsageLimit = async (req, res) => {
//   try {
//     const { company_id, event_type } = req.query;

//     if (!company_id || !event_type) {
//       return errorResponse(res, 'company_id and event_type are required', 400);
//     }

//     const result = await usageTrackingService.checkUsageLimit(company_id, event_type);

//     logger.info('GET', '/api/usage/check-limit', 200);
//     return successResponse(res, result, 'Usage limit checked successfully');
//   } catch (error) {
//     logger.error('Check usage limit error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// exports.getUsageReport = async (req, res) => {
//   try {
//     const { company_id, start_date, end_date } = req.query;

//     if (!company_id) {
//       return errorResponse(res, 'company_id is required', 400);
//     }

//     let query = `
//       SELECT 
//         cu.*,
//         bp.plan_name,
//         bp.max_whatsapp_messages,
//         bp.max_voice_minutes,
//         bp.max_leads,
//         CASE 
//           WHEN cu.whatsapp_messages_sent >= bp.max_whatsapp_messages THEN 'exceeded'
//           WHEN cu.whatsapp_messages_sent >= (bp.max_whatsapp_messages * 0.8) THEN 'warning'
//           ELSE 'normal'
//         END as whatsapp_status,
//         CASE 
//           WHEN cu.voice_minutes_used >= bp.max_voice_minutes THEN 'exceeded'
//           WHEN cu.voice_minutes_used >= (bp.max_voice_minutes * 0.8) THEN 'warning'
//           ELSE 'normal'
//         END as voice_status,
//         CASE 
//           WHEN cu.leads_created >= bp.max_leads THEN 'exceeded'
//           WHEN cu.leads_created >= (bp.max_leads * 0.8) THEN 'warning'
//           ELSE 'normal'
//         END as leads_status
//       FROM company_usage cu
//       JOIN company_subscriptions cs ON cu.company_id = cs.company_id
//       JOIN company_billing_plans bp ON cs.plan_id = bp.id
//       WHERE cu.company_id = $1
//     `;

//     const params = [company_id];

//     if (start_date && end_date) {
//       params.push(start_date, end_date);
//       query += ` AND cu.period_start >= $2::date AND cu.period_end <= $3::date`;
//     } else {
//       query += ` AND cu.period_start <= NOW() AND cu.period_end >= NOW()`;
//     }

//     query += ' ORDER BY cu.period_start DESC';

//     const result = await pool.query(query, params);

//     logger.info('GET', '/api/usage/report', 200);
//     return successResponse(res, result.rows, 'Usage report retrieved successfully');
//   } catch (error) {
//     logger.error('Get usage report error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// exports.getUsageAnalytics = async (req, res) => {
//   try {
//     const { company_id } = req.query;

//     if (!company_id) {
//       return errorResponse(res, 'company_id is required', 400);
//     }

//     // Get current period usage
//     const currentUsage = await pool.query(`
//       SELECT 
//         cu.*,
//         bp.plan_name,
//         bp.max_whatsapp_messages,
//         bp.max_voice_minutes,
//         bp.max_leads,
//         bp.max_ai_tokens
//       FROM company_usage cu
//       JOIN company_subscriptions cs ON cu.company_id = cs.company_id
//       JOIN company_billing_plans bp ON cs.plan_id = bp.id
//       WHERE cu.company_id = $1
//         AND cu.period_start <= NOW()
//         AND cu.period_end >= NOW()
//     `, [company_id]);

//     // Get usage trend (last 6 months)
//     const trend = await pool.query(`
//       SELECT 
//         TO_CHAR(period_start, 'YYYY-MM') as month,
//         SUM(whatsapp_messages_sent) as total_whatsapp,
//         SUM(voice_minutes_used) as total_voice,
//         SUM(leads_created) as total_leads,
//         SUM(ai_tokens_used) as total_ai_tokens
//       FROM company_usage
//       WHERE company_id = $1
//         AND period_start >= NOW() - INTERVAL '6 months'
//       GROUP BY TO_CHAR(period_start, 'YYYY-MM')
//       ORDER BY month DESC
//     `, [company_id]);

//     // Get top events
//     const topEvents = await pool.query(`
//       SELECT 
//         event_type,
//         COUNT(*) as count,
//         SUM(quantity) as total_quantity
//       FROM usage_events
//       WHERE company_id = $1
//         AND created_at >= NOW() - INTERVAL '30 days'
//       GROUP BY event_type
//       ORDER BY total_quantity DESC
//       LIMIT 10
//     `, [company_id]);

//     const analytics = {
//       current_usage: currentUsage.rows[0] || null,
//       usage_trend: trend.rows,
//       top_events: topEvents.rows,
//       summary: {
//         whatsapp_usage_percent: currentUsage.rows[0] 
//           ? ((currentUsage.rows[0].whatsapp_messages_sent / currentUsage.rows[0].max_whatsapp_messages) * 100).toFixed(2)
//           : 0,
//         voice_usage_percent: currentUsage.rows[0]
//           ? ((currentUsage.rows[0].voice_minutes_used / currentUsage.rows[0].max_voice_minutes) * 100).toFixed(2)
//           : 0,
//         leads_usage_percent: currentUsage.rows[0]
//           ? ((currentUsage.rows[0].leads_created / currentUsage.rows[0].max_leads) * 100).toFixed(2)
//           : 0
//       }
//     };

//     logger.info('GET', '/api/usage/analytics', 200);
//     return successResponse(res, analytics, 'Usage analytics retrieved successfully');
//   } catch (error) {
//     logger.error('Get usage analytics error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// exports.resetUsage = async (req, res) => {
//   try {
//     const { company_id } = req.body;

//     if (!company_id) {
//       return errorResponse(res, 'company_id is required', 400);
//     }

//     // Only allow admin to reset
//     // Add your admin check here

//     const now = new Date();
//     const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
//     const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

//     await pool.query(`
//       UPDATE company_usage
//       SET 
//         whatsapp_messages_sent = 0,
//         voice_minutes_used = 0,
//         leads_created = 0,
//         ai_tokens_used = 0,
//         updated_at = NOW()
//       WHERE company_id = $1
//         AND period_start = $2
//     `, [company_id, periodStart]);

//     logger.info('POST', '/api/usage/reset', 200);
//     return successResponse(res, null, 'Usage reset successfully');
//   } catch (error) {
//     logger.error('Reset usage error:', error);
//     return errorResponse(res, error.message, 500);
//   }
// };

// module.exports = exports;



// src/controllers/usageTracking.controller.js
const pool = require('../config/database');
const usageTrackingService = require('../services/usage/usageTracking.service');
const { successResponse, errorResponse } = require('../utils/response');
const {logger} = require('../utils/logger');

// ============================================
// ADMIN AUTHENTICATION CHECK
// ============================================
const checkAdminPermission = async (userId, companyId) => {
  try {
    const result = await pool.query(`
      SELECT role FROM users 
      WHERE id = $1 AND company_id = $2 AND role IN ('admin', 'super_admin')
    `, [userId, companyId]);

    return result.rows.length > 0;
  } catch (error) {
    logger.error('Admin permission check error:', error);
    return false;
  }
};

// ============================================
// USAGE TRACKING
// ============================================

/**
 * Track a usage event
 * POST /api/usage/track
 */
exports.trackUsage = async (req, res) => {
  try {
    const { company_id, event_type, quantity = 1, metadata = {} } = req.body;

    if (!company_id || !event_type) {
      return errorResponse(res, 'company_id and event_type are required', 400);
    }

    // Valid event types
    const validEventTypes = [
      'whatsapp_message',
      'voice_call',
      'lead_created',
      'ai_token_usage',
      'email_sent',
      'sms_sent'
    ];

    if (!validEventTypes.includes(event_type)) {
      return errorResponse(res, `Invalid event_type. Must be one of: ${validEventTypes.join(', ')}`, 400);
    }

    await usageTrackingService.trackUsage(company_id, event_type, quantity, metadata);

    logger.info('POST', '/api/usage/track', 200, { company_id, event_type, quantity });
    return successResponse(res, null, 'Usage tracked successfully');
  } catch (error) {
    logger.error('Track usage error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Check if company has reached usage limit
 * GET /api/usage/check-limit
 */
exports.checkUsageLimit = async (req, res) => {
  try {
    const { company_id, event_type } = req.query;

    if (!company_id || !event_type) {
      return errorResponse(res, 'company_id and event_type are required', 400);
    }

    const result = await usageTrackingService.checkUsageLimit(company_id, event_type);

    logger.info('GET', '/api/usage/check-limit', 200, { company_id, event_type });
    return successResponse(res, result, 'Usage limit checked successfully');
  } catch (error) {
    logger.error('Check usage limit error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get usage report for a company
 * GET /api/usage/report
 */
exports.getUsageReport = async (req, res) => {
  try {
    const { company_id, start_date, end_date, period = 'current' } = req.query;

    if (!company_id) {
      return errorResponse(res, 'company_id is required', 400);
    }

    let query = `
      SELECT 
        cu.*,
        bp.plan_name,
        bp.max_whatsapp_messages,
        bp.max_voice_minutes,
        bp.max_leads,
        bp.max_ai_tokens,
        bp.max_email_sends,
        bp.max_sms_sends,
        -- Calculate usage percentages
        ROUND((cu.whatsapp_messages_sent::numeric / NULLIF(bp.max_whatsapp_messages, 0) * 100), 2) as whatsapp_usage_percent,
        ROUND((cu.voice_minutes_used::numeric / NULLIF(bp.max_voice_minutes, 0) * 100), 2) as voice_usage_percent,
        ROUND((cu.leads_created::numeric / NULLIF(bp.max_leads, 0) * 100), 2) as leads_usage_percent,
        ROUND((cu.ai_tokens_used::numeric / NULLIF(bp.max_ai_tokens, 0) * 100), 2) as ai_tokens_usage_percent,
        -- Determine status (normal, warning, exceeded)
        CASE 
          WHEN cu.whatsapp_messages_sent >= bp.max_whatsapp_messages THEN 'exceeded'
          WHEN cu.whatsapp_messages_sent >= (bp.max_whatsapp_messages * 0.8) THEN 'warning'
          ELSE 'normal'
        END as whatsapp_status,
        CASE 
          WHEN cu.voice_minutes_used >= bp.max_voice_minutes THEN 'exceeded'
          WHEN cu.voice_minutes_used >= (bp.max_voice_minutes * 0.8) THEN 'warning'
          ELSE 'normal'
        END as voice_status,
        CASE 
          WHEN cu.leads_created >= bp.max_leads THEN 'exceeded'
          WHEN cu.leads_created >= (bp.max_leads * 0.8) THEN 'warning'
          ELSE 'normal'
        END as leads_status,
        CASE 
          WHEN cu.ai_tokens_used >= bp.max_ai_tokens THEN 'exceeded'
          WHEN cu.ai_tokens_used >= (bp.max_ai_tokens * 0.8) THEN 'warning'
          ELSE 'normal'
        END as ai_tokens_status
      FROM company_usage cu
      JOIN company_subscriptions cs ON cu.company_id = cs.company_id
      JOIN company_billing_plans bp ON cs.plan_id = bp.id
      WHERE cu.company_id = $1 AND cs.status = 'active'
    `;

    const params = [company_id];

    // Filter by date range or period
    if (start_date && end_date) {
      params.push(start_date, end_date);
      query += ` AND cu.period_start >= $2::date AND cu.period_end <= $3::date`;
    } else if (period === 'current') {
      query += ` AND cu.period_start <= NOW() AND cu.period_end >= NOW()`;
    } else if (period === 'last_month') {
      query += ` AND cu.period_start >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                 AND cu.period_end < DATE_TRUNC('month', NOW())`;
    } else if (period === 'last_3_months') {
      query += ` AND cu.period_start >= DATE_TRUNC('month', NOW() - INTERVAL '3 months')`;
    }

    query += ' ORDER BY cu.period_start DESC';

    const result = await pool.query(query, params);

    logger.info('GET', '/api/usage/report', 200, { company_id, period });
    return successResponse(res, result.rows, 'Usage report retrieved successfully');
  } catch (error) {
    logger.error('Get usage report error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get detailed usage analytics
 * GET /api/usage/analytics
 */
exports.getUsageAnalytics = async (req, res) => {
  try {
    const { company_id, months = 6 } = req.query;

    if (!company_id) {
      return errorResponse(res, 'company_id is required', 400);
    }

    // Get current period usage
    const currentUsage = await pool.query(`
      SELECT 
        cu.*,
        bp.plan_name,
        bp.max_whatsapp_messages,
        bp.max_voice_minutes,
        bp.max_leads,
        bp.max_ai_tokens,
        bp.price_per_month,
        cs.billing_cycle,
        cs.next_billing_date
      FROM company_usage cu
      JOIN company_subscriptions cs ON cu.company_id = cs.company_id
      JOIN company_billing_plans bp ON cs.plan_id = bp.id
      WHERE cu.company_id = $1
        AND cu.period_start <= NOW()
        AND cu.period_end >= NOW()
        AND cs.status = 'active'
    `, [company_id]);

    // Get usage trend
    const trend = await pool.query(`
      SELECT 
        TO_CHAR(period_start, 'YYYY-MM') as month,
        period_start,
        period_end,
        SUM(whatsapp_messages_sent) as total_whatsapp,
        SUM(voice_minutes_used) as total_voice,
        SUM(leads_created) as total_leads,
        SUM(ai_tokens_used) as total_ai_tokens,
        SUM(email_sends) as total_emails,
        SUM(sms_sends) as total_sms
      FROM company_usage
      WHERE company_id = $1
        AND period_start >= NOW() - INTERVAL '${parseInt(months)} months'
      GROUP BY TO_CHAR(period_start, 'YYYY-MM'), period_start, period_end
      ORDER BY period_start DESC
    `, [company_id]);

    // Get top events
    const topEvents = await pool.query(`
      SELECT 
        event_type,
        COUNT(*) as event_count,
        SUM(quantity) as total_quantity,
        MAX(created_at) as last_used
      FROM usage_events
      WHERE company_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY event_type
      ORDER BY total_quantity DESC
      LIMIT 10
    `, [company_id]);

    // Get daily usage for last 30 days
    const dailyUsage = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        event_type,
        SUM(quantity) as total
      FROM usage_events
      WHERE company_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at), event_type
      ORDER BY date DESC
    `, [company_id]);

    // Calculate average daily usage
    const avgDaily = await pool.query(`
      SELECT 
        event_type,
        ROUND(AVG(daily_total), 2) as avg_daily_usage
      FROM (
        SELECT 
          DATE(created_at) as date,
          event_type,
          SUM(quantity) as daily_total
        FROM usage_events
        WHERE company_id = $1
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at), event_type
      ) daily_stats
      GROUP BY event_type
    `, [company_id]);

    const analytics = {
      current_usage: currentUsage.rows[0] || null,
      usage_trend: trend.rows,
      top_events: topEvents.rows,
      daily_usage: dailyUsage.rows,
      average_daily: avgDaily.rows,
      summary: {
        whatsapp_usage_percent: currentUsage.rows[0] 
          ? ((currentUsage.rows[0].whatsapp_messages_sent / currentUsage.rows[0].max_whatsapp_messages) * 100).toFixed(2)
          : 0,
        voice_usage_percent: currentUsage.rows[0]
          ? ((currentUsage.rows[0].voice_minutes_used / currentUsage.rows[0].max_voice_minutes) * 100).toFixed(2)
          : 0,
        leads_usage_percent: currentUsage.rows[0]
          ? ((currentUsage.rows[0].leads_created / currentUsage.rows[0].max_leads) * 100).toFixed(2)
          : 0,
        ai_tokens_usage_percent: currentUsage.rows[0]
          ? ((currentUsage.rows[0].ai_tokens_used / currentUsage.rows[0].max_ai_tokens) * 100).toFixed(2)
          : 0,
        days_until_reset: currentUsage.rows[0]
          ? Math.ceil((new Date(currentUsage.rows[0].period_end) - new Date()) / (1000 * 60 * 60 * 24))
          : 0
      }
    };

    logger.info('GET', '/api/usage/analytics', 200, { company_id });
    return successResponse(res, analytics, 'Usage analytics retrieved successfully');
  } catch (error) {
    logger.error('Get usage analytics error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Reset usage for a company (Admin only)
 * POST /api/usage/reset
 */
exports.resetUsage = async (req, res) => {
  try {
    const { company_id } = req.body;
    const userId = req.user?.id; // Assuming user is attached from auth middleware

    if (!company_id) {
      return errorResponse(res, 'company_id is required', 400);
    }

    if (!userId) {
      return errorResponse(res, 'User authentication required', 401);
    }

    // Check if user has admin permission
    const isAdmin = await checkAdminPermission(userId, company_id);
    if (!isAdmin) {
      logger.warn('Unauthorized usage reset attempt', { userId, company_id });
      return errorResponse(res, 'Unauthorized. Admin access required.', 403);
    }

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Reset current period usage
    const result = await pool.query(`
      UPDATE company_usage
      SET 
        whatsapp_messages_sent = 0,
        voice_minutes_used = 0,
        leads_created = 0,
        ai_tokens_used = 0,
        email_sends = 0,
        sms_sends = 0,
        updated_at = NOW()
      WHERE company_id = $1
        AND period_start = $2
      RETURNING *
    `, [company_id, periodStart]);

    if (result.rows.length === 0) {
      return errorResponse(res, 'No usage record found for current period', 404);
    }

    // Log admin action
    await pool.query(`
      INSERT INTO audit_logs (company_id, user_id, action, details, created_at)
      VALUES ($1, $2, 'usage_reset', $3, NOW())
    `, [
      company_id,
      userId,
      JSON.stringify({ period_start: periodStart, reset_by: userId })
    ]);

    logger.info('POST', '/api/usage/reset', 200, { company_id, admin_id: userId });
    return successResponse(res, result.rows[0], 'Usage reset successfully');
  } catch (error) {
    logger.error('Reset usage error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get usage events history
 * GET /api/usage/events
 */
exports.getUsageEvents = async (req, res) => {
  try {
    const { company_id, event_type, limit = 100, offset = 0, start_date, end_date } = req.query;

    if (!company_id) {
      return errorResponse(res, 'company_id is required', 400);
    }

    let query = `
      SELECT 
        ue.*,
        l.name as lead_name,
        l.phone_number
      FROM usage_events ue
      LEFT JOIN leads l ON ue.metadata->>'lead_id' = l.id::text
      WHERE ue.company_id = $1
    `;

    const params = [company_id];
    let paramIndex = 2;

    if (event_type) {
      query += ` AND ue.event_type = $${paramIndex}`;
      params.push(event_type);
      paramIndex++;
    }

    if (start_date && end_date) {
      query += ` AND ue.created_at BETWEEN $${paramIndex}::date AND $${paramIndex + 1}::date`;
      params.push(start_date, end_date);
      paramIndex += 2;
    }

    query += ` ORDER BY ue.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM usage_events
      WHERE company_id = $1
      ${event_type ? `AND event_type = $2` : ''}
    `;
    const countParams = event_type ? [company_id, event_type] : [company_id];
    const countResult = await pool.query(countQuery, countParams);

    logger.info('GET', '/api/usage/events', 200, { company_id, event_type });
    return successResponse(res, {
      events: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: parseInt(offset) + result.rows.length < parseInt(countResult.rows[0].total)
      }
    }, 'Usage events retrieved successfully');
  } catch (error) {
    logger.error('Get usage events error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get usage alerts (warnings about approaching limits)
 * GET /api/usage/alerts
 */
exports.getUsageAlerts = async (req, res) => {
  try {
    const { company_id } = req.query;

    if (!company_id) {
      return errorResponse(res, 'company_id is required', 400);
    }

    const result = await pool.query(`
      SELECT 
        cu.company_id,
        bp.plan_name,
        CASE 
          WHEN cu.whatsapp_messages_sent >= bp.max_whatsapp_messages THEN 'critical'
          WHEN cu.whatsapp_messages_sent >= (bp.max_whatsapp_messages * 0.9) THEN 'high'
          WHEN cu.whatsapp_messages_sent >= (bp.max_whatsapp_messages * 0.8) THEN 'medium'
          ELSE 'low'
        END as whatsapp_alert_level,
        cu.whatsapp_messages_sent,
        bp.max_whatsapp_messages,
        CASE 
          WHEN cu.voice_minutes_used >= bp.max_voice_minutes THEN 'critical'
          WHEN cu.voice_minutes_used >= (bp.max_voice_minutes * 0.9) THEN 'high'
          WHEN cu.voice_minutes_used >= (bp.max_voice_minutes * 0.8) THEN 'medium'
          ELSE 'low'
        END as voice_alert_level,
        cu.voice_minutes_used,
        bp.max_voice_minutes,
        CASE 
          WHEN cu.leads_created >= bp.max_leads THEN 'critical'
          WHEN cu.leads_created >= (bp.max_leads * 0.9) THEN 'high'
          WHEN cu.leads_created >= (bp.max_leads * 0.8) THEN 'medium'
          ELSE 'low'
        END as leads_alert_level,
        cu.leads_created,
        bp.max_leads,
        cu.period_end,
        EXTRACT(DAY FROM (cu.period_end - NOW())) as days_remaining
      FROM company_usage cu
      JOIN company_subscriptions cs ON cu.company_id = cs.company_id
      JOIN company_billing_plans bp ON cs.plan_id = bp.id
      WHERE cu.company_id = $1
        AND cu.period_start <= NOW()
        AND cu.period_end >= NOW()
        AND cs.status = 'active'
    `, [company_id]);

    if (result.rows.length === 0) {
      return successResponse(res, { alerts: [], has_alerts: false }, 'No usage data found');
    }

    const data = result.rows[0];
    const alerts = [];

    // Generate alerts for each metric
    if (data.whatsapp_alert_level !== 'low') {
      alerts.push({
        type: 'whatsapp_messages',
        level: data.whatsapp_alert_level,
        message: `WhatsApp usage at ${((data.whatsapp_messages_sent / data.max_whatsapp_messages) * 100).toFixed(0)}% (${data.whatsapp_messages_sent}/${data.max_whatsapp_messages})`,
        current: data.whatsapp_messages_sent,
        limit: data.max_whatsapp_messages,
        percentage: ((data.whatsapp_messages_sent / data.max_whatsapp_messages) * 100).toFixed(2)
      });
    }

    if (data.voice_alert_level !== 'low') {
      alerts.push({
        type: 'voice_minutes',
        level: data.voice_alert_level,
        message: `Voice usage at ${((data.voice_minutes_used / data.max_voice_minutes) * 100).toFixed(0)}% (${data.voice_minutes_used}/${data.max_voice_minutes} mins)`,
        current: data.voice_minutes_used,
        limit: data.max_voice_minutes,
        percentage: ((data.voice_minutes_used / data.max_voice_minutes) * 100).toFixed(2)
      });
    }

    if (data.leads_alert_level !== 'low') {
      alerts.push({
        type: 'leads',
        level: data.leads_alert_level,
        message: `Leads usage at ${((data.leads_created / data.max_leads) * 100).toFixed(0)}% (${data.leads_created}/${data.max_leads})`,
        current: data.leads_created,
        limit: data.max_leads,
        percentage: ((data.leads_created / data.max_leads) * 100).toFixed(2)
      });
    }

    logger.info('GET', '/api/usage/alerts', 200, { company_id, alert_count: alerts.length });
    return successResponse(res, {
      alerts,
      has_alerts: alerts.length > 0,
      days_remaining: Math.ceil(data.days_remaining),
      period_end: data.period_end,
      plan_name: data.plan_name
    }, 'Usage alerts retrieved successfully');
  } catch (error) {
    logger.error('Get usage alerts error:', error);
    return errorResponse(res, error.message, 500);
  }
};

module.exports = exports;