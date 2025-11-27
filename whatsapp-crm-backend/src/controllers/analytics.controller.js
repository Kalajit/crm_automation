const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');
const AnalyticsService = require('../services/analytics/analytics.service');

/**
 * Track analytics events
 */
exports.trackEvent = async (req, res) => {
  try {
    const { event_name, event_properties, lead_id, company_id } = req.body;

    if (!event_name) {
      return res.status(400).json({ error: 'event_name is required' });
    }

    const query = `
      INSERT INTO analytics_events (event_name, event_properties, lead_id, company_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      event_name,
      event_properties ? JSON.stringify(event_properties) : null,
      lead_id || null,
      company_id || null
    ]);

    logRequest('POST', '/api/analytics/events', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/analytics/events', 500);
    handleError(res, error);
  }
};

/**
 * Get analytics summary
 */
exports.getAnalyticsSummary = async (req, res) => {
  try {
    const { start_date, end_date, company_id } = req.query;

    let query = `
      SELECT 
        event_name,
        COUNT(*) as event_count,
        COUNT(DISTINCT lead_id) as unique_leads,
        DATE(created_at) as event_date
      FROM analytics_events
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;

    if (start_date) {
      paramCount++;
      query += ` AND created_at >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND created_at <= $${paramCount}`;
      params.push(end_date);
    }

    if (company_id) {
      paramCount++;
      query += ` AND company_id = $${paramCount}`;
      params.push(company_id);
    }

    query += ' GROUP BY event_name, DATE(created_at) ORDER BY event_date DESC;';

    const result = await pool.query(query, params);

    logRequest('GET', '/api/analytics/summary', 200);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/analytics/summary', 500);
    handleError(res, error);
  }
};

/**
 * Get hot leads (qualified/interested)
 */
exports.getHotLeads = async (req, res) => {
  try {
    const { limit, company_id } = req.query;

    let query = `
      SELECT 
        l.*,
        cl.sentiment->>'tone_score' as tone_score,
        cl.summary->>'intent' as intent,
        cl.created_at as last_call_date
      FROM leads l
      LEFT JOIN call_logs cl ON l.id = cl.lead_id
      WHERE (
        l.lead_status = 'qualified'
        OR (cl.sentiment->>'tone_score')::int >= 7
        OR cl.summary->>'intent' = 'interested'
      )
    `;

    const params = [];
    let paramCount = 0;

    if (company_id) {
      paramCount++;
      query += ` AND l.company_id = $${paramCount}`;
      params.push(company_id);
    }

    query += ' ORDER BY cl.created_at DESC';

    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    } else {
      query += ' LIMIT 50';
    }

    const result = await pool.query(query, params);

    logRequest('GET', '/api/analytics/hot-leads', 200);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/analytics/hot-leads', 500);
    handleError(res, error);
  }
};

/**
 * Get failed calls report
 */
exports.getFailedCalls = async (req, res) => {
  try {
    const { limit, company_id, start_date } = req.query;

    let query = `
      SELECT 
        cl.*,
        l.name,
        l.email,
        l.phone_number,
        l.company_id
      FROM call_logs cl
      LEFT JOIN leads l ON cl.lead_id = l.id
      WHERE cl.call_status = 'failed'
    `;

    const params = [];
    let paramCount = 0;

    if (company_id) {
      paramCount++;
      query += ` AND cl.company_id = $${paramCount}`;
      params.push(company_id);
    }

    if (start_date) {
      paramCount++;
      query += ` AND cl.created_at >= $${paramCount}`;
      params.push(start_date);
    }

    query += ' ORDER BY cl.created_at DESC';

    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    } else {
      query += ' LIMIT 50';
    }

    const result = await pool.query(query, params);

    logRequest('GET', '/api/analytics/failed-calls', 200);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/analytics/failed-calls', 500);
    handleError(res, error);
  }
};

/**
 * Get daily summary report
 */
exports.getDailySummary = async (req, res) => {
  try {
    const { date, company_id } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const summary = {};

    // Calls summary
    let callsQuery = `
      SELECT 
        call_type,
        call_status,
        COUNT(*) as count,
        AVG(call_duration) as avg_duration
      FROM call_logs
      WHERE DATE(created_at) = $1
    `;
    const params = [targetDate];
    let paramCount = 1;

    if (company_id) {
      paramCount++;
      callsQuery += ` AND company_id = $${paramCount}`;
      params.push(company_id);
    }

    callsQuery += ' GROUP BY call_type, call_status;';
    
    const callsResult = await pool.query(callsQuery, params);
    summary.calls = callsResult.rows;

    // Sentiment summary
    const sentimentQuery = `
      SELECT 
        sentiment->>'sentiment' as sentiment_type,
        COUNT(*) as count
      FROM call_logs
      WHERE DATE(created_at) = $1
      AND sentiment IS NOT NULL
      ${company_id ? `AND company_id = $2` : ''}
      GROUP BY sentiment->>'sentiment';
    `;
    
    const sentimentResult = await pool.query(sentimentQuery, company_id ? [targetDate, company_id] : [targetDate]);
    summary.sentiment = sentimentResult.rows;

    // Leads updated
    const leadsQuery = `
      SELECT 
        lead_status,
        COUNT(*) as count
      FROM leads
      WHERE DATE(updated_at) = $1
      ${company_id ? `AND company_id = $2` : ''}
      GROUP BY lead_status;
    `;
    
    const leadsResult = await pool.query(leadsQuery, company_id ? [targetDate, company_id] : [targetDate]);
    summary.leads = leadsResult.rows;

    logRequest('GET', '/api/analytics/daily-summary', 200);
    res.json({ 
      success: true, 
      date: targetDate,
      data: summary 
    });
  } catch (error) {
    logRequest('GET', '/api/analytics/daily-summary', 500);
    handleError(res, error);
  }
};

/**
 * AI fallback handler
 */
exports.aiFollback = async (req, res) => {
  try {
    const { phone_number, error_type, conversation_id } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    // Log AI failure
    await pool.query(`
      INSERT INTO system_notifications (
        notification_type, title, message, priority
      )
      VALUES ('error', 'AI Failure Detected', $1, 'high')
    `, [`AI failed for ${phone_number}: ${error_type || 'unknown'}`]);

    // Send fallback message to user
    const fallbackMessage = error_type === 'timeout' 
      ? "I'm experiencing technical difficulties. A human agent will contact you shortly!"
      : "Apologies, I couldn't process that. Let me connect you with our team.";

    // Create takeover request automatically
    const leadResult = await pool.query(
      'SELECT id FROM leads WHERE phone_number = $1',
      [phone_number]
    );

    let takeoverCreated = false;
    if (leadResult.rows.length > 0) {
      await pool.query(`
        INSERT INTO takeover_requests (
          lead_id, conversation_id, request_type, trigger_reason, priority, status
        )
        VALUES ($1, $2, 'whatsapp_takeover', 'ai_failure', 'urgent', 'pending')
      `, [leadResult.rows[0].id, conversation_id || null]);
      takeoverCreated = true;
    }

    logRequest('POST', '/api/analytics/ai-fallback', 200);
    res.json({ 
      success: true, 
      fallback_message: fallbackMessage,
      takeover_created: takeoverCreated
    });
  } catch (error) {
    logRequest('POST', '/api/analytics/ai-fallback', 500);
    handleError(res, error);
  }
};

/**
 * Rate limiting check for conversations
 */
const conversationRateLimits = new Map();

exports.rateCheck = async (req, res) => {
  try {
    const { phone } = req.params;
    const now = Date.now();
    const limit = 10; // messages per minute
    const window = 60000; // 1 minute

    if (!phone) {
      return res.status(400).json({ error: 'phone parameter is required' });
    }

    let rateData = conversationRateLimits.get(phone);

    if (!rateData || now > rateData.resetTime) {
      rateData = { count: 0, resetTime: now + window };
      conversationRateLimits.set(phone, rateData);
    }

    rateData.count++;

    const allowed = rateData.count <= limit;

    if (!allowed) {
      // Send rate limit notification
      await pool.query(`
        INSERT INTO system_notifications (
          notification_type, title, message, priority
        )
        VALUES ('warning', 'Rate Limit Hit', $1, 'normal')
      `, [`${phone} exceeded ${limit} messages/min`]);
    }

    logRequest('GET', `/api/analytics/rate-check/${phone}`, 200);
    res.json({
      success: true,
      allowed: allowed,
      remaining: Math.max(0, limit - rateData.count),
      reset_in_seconds: Math.ceil((rateData.resetTime - now) / 1000)
    });
  } catch (error) {
    logRequest('GET', `/api/analytics/rate-check/${phone}`, 500);
    handleError(res, error);
  }
};

/**
 * System health status
 */
exports.systemStatus = async (req, res) => {
  try {
    const metrics = {};
    
    // Database health
    const dbCheck = await pool.query('SELECT NOW()');
    metrics.database = { healthy: true, timestamp: dbCheck.rows[0].now };
    
    // Active conversations
    const convCount = await pool.query('SELECT COUNT(*) FROM conversations');
    metrics.conversations = { total: parseInt(convCount.rows[0].count) };
    
    // Recent errors
    const errorCount = await pool.query(`
      SELECT COUNT(*) FROM system_notifications 
      WHERE notification_type = 'error' 
      AND created_at >= NOW() - INTERVAL '1 hour'
    `);
    metrics.errors_last_hour = parseInt(errorCount.rows[0].count);
    
    // Pending takeovers
    const takeoverCount = await pool.query(`
      SELECT COUNT(*) FROM takeover_requests 
      WHERE status IN ('pending', 'assigned')
    `);
    metrics.pending_takeovers = parseInt(takeoverCount.rows[0].count);
    
    // Active calls
    const activeCallsCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM call_logs
      WHERE call_status IN ('initiated', 'in-progress', 'ringing')
      AND created_at >= NOW() - INTERVAL '1 hour'
    `);
    metrics.active_calls = parseInt(activeCallsCount.rows[0].count);
    
    logRequest('GET', '/api/analytics/system-status', 200);
    res.json({
      success: true,
      status: metrics.errors_last_hour < 10 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      data: metrics
    });
  } catch (error) {
    logRequest('GET', '/api/analytics/system-status', 500);
    handleError(res, error);
  }
};






const analyticsService = new AnalyticsService(pool);

exports.getDashboard = async (req, res) => {
  try {
    const { company_id, time_range = '24h' } = req.query;
    const data = await analyticsService.getRealTimeDashboard(company_id, time_range);
    return sendSuccess(res, data);
  } catch (error) {
    return handleError(res, error.message);
  }
};

exports.getActivity = async (req, res) => {
  try {
    const { company_id, limit = 50 } = req.query;
    const data = await analyticsService.getRealTimeActivity(company_id, parseInt(limit));
    return sendSuccess(res, data);
  } catch (error) {
    return handleError(res, error.message);
  }
};

exports.getPipeline = async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    const data = await analyticsService.getPipelineMetrics(company_id, start_date, end_date);
    return sendSuccess(res, data);
  } catch (error) {
    return handleError(res, error.message);
  }
};

exports.getVelocity = async (req, res) => {
  try {
    const { company_id, days = 30 } = req.query;
    const data = await analyticsService.getLeadVelocity(company_id, parseInt(days));
    return sendSuccess(res, data);
  } catch (error) {
    return handleError(res, error.message);
  }
};

exports.getForecast = async (req, res) => {
  try {
    const { company_id, months = 3 } = req.query;
    const data = await analyticsService.forecastRevenue(company_id, parseInt(months));
    return sendSuccess(res, data);
  } catch (error) {
    return handleError(res, error.message);
  }
};

exports.getChurnPrediction = async (req, res) => {
  try {
    const { company_id } = req.query;
    const data = await analyticsService.predictChurn(company_id);
    return sendSuccess(res, data);
  } catch (error) {
    return handleError(res, error.message);
  }
};

exports.buildCustomReport = async (req, res) => {
  try {
    const { company_id, report_config } = req.body;
    const data = await analyticsService.buildCustomReport(company_id, report_config);
    return sendSuccess(res, data);
  } catch (error) {
    return handleError(res, error.message);
  }
};

exports.comparePeriods = async (req, res) => {
  try {
    const { company_id, metric, current_period, previous_period } = req.body;
    const data = await analyticsService.comparePeriods(company_id, metric, current_period, previous_period);
    return sendSuccess(res, data);
  } catch (error) {
    return handleError(res, error.message);
  }
};

exports.exportCSV = async (req, res) => {
  try {
    const { data, fields } = req.body;
    const csv = await analyticsService.exportToCSV(data, fields);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=export.csv');
    res.send(csv);
  } catch (error) {
    return handleError(res, error.message);
  }
};

exports.exportExcel = async (req, res) => {
  try {
    const { data, sheet_name } = req.body;
    const buffer = await analyticsService.exportToExcel(data, sheet_name);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=export.xlsx');
    res.send(buffer);
  } catch (error) {
    return handleError(res, error.message);
  }
};











// Cleanup rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of conversationRateLimits.entries()) {
    if (now > data.resetTime + 300000) { // 5 min past reset
      conversationRateLimits.delete(phone);
    }
  }
}, 300000);