const pool = require('../../config/database');
const {logger} = require('../../utils/logger');

// Get usage column mapping
function getUsageColumn(eventType) {
  const mapping = {
    'whatsapp_message': 'whatsapp_messages_sent',
    'voice_call': 'voice_minutes_used',
    'lead_created': 'leads_created',
    'ai_token': 'ai_tokens_used'
  };
  return mapping[eventType] || 'whatsapp_messages_sent';
}

// Track usage event
exports.trackUsage = async (companyId, eventType, quantity = 1, metadata = {}) => {
  try {
    await pool.query(`
      INSERT INTO usage_events (company_id, event_type, quantity, metadata)
      VALUES ($1, $2, $3, $4)
    `, [companyId, eventType, quantity, JSON.stringify(metadata)]);
    
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const column = getUsageColumn(eventType);
    
    await pool.query(`
      INSERT INTO company_usage (
        company_id, period_start, period_end, ${column}
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (company_id, period_start) DO UPDATE
      SET ${column} = company_usage.${column} + $4,
          updated_at = NOW()
    `, [companyId, periodStart, periodEnd, quantity]);
    
  } catch (error) {
    logger.error('Usage tracking error:', error);
  }
};

// Check usage limit
exports.checkUsageLimit = async (companyId, eventType) => {
  try {
    const result = await pool.query(`
      SELECT 
        cs.*,
        bp.max_whatsapp_messages,
        bp.max_voice_minutes,
        bp.max_leads,
        cu.whatsapp_messages_sent,
        cu.voice_minutes_used,
        cu.leads_created
      FROM company_subscriptions cs
      JOIN company_billing_plans bp ON cs.plan_id = bp.id
      LEFT JOIN company_usage cu ON cu.company_id = cs.company_id
        AND cu.period_start <= NOW() 
        AND cu.period_end >= NOW()
      WHERE cs.company_id = $1 AND cs.status = 'active'
      ORDER BY cs.created_at DESC
      LIMIT 1
    `, [companyId]);
    
    if (result.rows.length === 0) {
      return { allowed: false, reason: 'No active subscription' };
    }
    
    const sub = result.rows[0];
    
    const checks = {
      'whatsapp_message': {
        used: sub.whatsapp_messages_sent || 0,
        limit: sub.max_whatsapp_messages
      },
      'voice_call': {
        used: sub.voice_minutes_used || 0,
        limit: sub.max_voice_minutes
      },
      'lead_created': {
        used: sub.leads_created || 0,
        limit: sub.max_leads
      }
    };
    
    const check = checks[eventType];
    if (!check) {
      return { allowed: true };
    }
    
    if (check.used >= check.limit) {
      return {
        allowed: false,
        reason: 'Usage limit exceeded',
        used: check.used,
        limit: check.limit
      };
    }
    
    return {
      allowed: true,
      used: check.used,
      limit: check.limit,
      remaining: check.limit - check.used
    };
    
  } catch (error) {
    logger.error('Usage limit check error:', error);
    return { allowed: true };
  }
};



/**
 * Get usage summary for a company
 */
exports.getUsageSummary = async (companyId, startDate = null, endDate = null) => {
  try {
    let dateFilter = '';
    const params = [companyId];

    if (startDate && endDate) {
      params.push(startDate, endDate);
      dateFilter = ` AND period_start >= $2::date AND period_end <= $3::date`;
    } else {
      dateFilter = ` AND period_start <= NOW() AND period_end >= NOW()`;
    }

    const result = await pool.query(`
      SELECT 
        cu.*,
        bp.plan_name,
        bp.max_whatsapp_messages,
        bp.max_voice_minutes,
        bp.max_leads,
        bp.max_ai_tokens
      FROM company_usage cu
      JOIN company_subscriptions cs ON cu.company_id = cs.company_id
      JOIN company_billing_plans bp ON cs.plan_id = bp.id
      WHERE cu.company_id = $1 ${dateFilter}
      ORDER BY cu.period_start DESC
      LIMIT 1
    `, params);

    if (result.rows.length === 0) {
      return null;
    }

    const usage = result.rows[0];

    return {
      ...usage,
      whatsapp_remaining: usage.max_whatsapp_messages - usage.whatsapp_messages_sent,
      voice_remaining: usage.max_voice_minutes - usage.voice_minutes_used,
      leads_remaining: usage.max_leads - usage.leads_created,
      ai_tokens_remaining: usage.max_ai_tokens - usage.ai_tokens_used,
      whatsapp_percent: ((usage.whatsapp_messages_sent / usage.max_whatsapp_messages) * 100).toFixed(2),
      voice_percent: ((usage.voice_minutes_used / usage.max_voice_minutes) * 100).toFixed(2),
      leads_percent: ((usage.leads_created / usage.max_leads) * 100).toFixed(2),
      ai_tokens_percent: ((usage.ai_tokens_used / usage.max_ai_tokens) * 100).toFixed(2)
    };
  } catch (error) {
    logger.error('Get usage summary error:', error);
    throw error;
  }
};

/**
 * Check if company is approaching limit (80% threshold)
 */
exports.checkUsageWarnings = async (companyId) => {
  try {
    const summary = await exports.getUsageSummary(companyId);
    
    if (!summary) {
      return { warnings: [] };
    }

    const warnings = [];

    if (parseFloat(summary.whatsapp_percent) >= 80) {
      warnings.push({
        type: 'whatsapp',
        message: `WhatsApp messages usage at ${summary.whatsapp_percent}%`,
        severity: parseFloat(summary.whatsapp_percent) >= 95 ? 'critical' : 'warning'
      });
    }

    if (parseFloat(summary.voice_percent) >= 80) {
      warnings.push({
        type: 'voice',
        message: `Voice minutes usage at ${summary.voice_percent}%`,
        severity: parseFloat(summary.voice_percent) >= 95 ? 'critical' : 'warning'
      });
    }

    if (parseFloat(summary.leads_percent) >= 80) {
      warnings.push({
        type: 'leads',
        message: `Leads created usage at ${summary.leads_percent}%`,
        severity: parseFloat(summary.leads_percent) >= 95 ? 'critical' : 'warning'
      });
    }

    if (parseFloat(summary.ai_tokens_percent) >= 80) {
      warnings.push({
        type: 'ai_tokens',
        message: `AI tokens usage at ${summary.ai_tokens_percent}%`,
        severity: parseFloat(summary.ai_tokens_percent) >= 95 ? 'critical' : 'warning'
      });
    }

    return {
      warnings,
      summary
    };
  } catch (error) {
    logger.error('Check usage warnings error:', error);
    throw error;
  }
};

/**
 * Reset usage for new billing period
 */
exports.resetMonthlyUsage = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const now = new Date();
    const newPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get all active companies
    const companies = await client.query(`
      SELECT DISTINCT company_id 
      FROM company_subscriptions 
      WHERE status = 'active'
    `);

    for (const company of companies.rows) {
      await client.query(`
        INSERT INTO company_usage (
          company_id, 
          period_start, 
          period_end,
          whatsapp_messages_sent,
          voice_minutes_used,
          leads_created,
          ai_tokens_used
        ) VALUES ($1, $2, $3, 0, 0, 0, 0)
        ON CONFLICT (company_id, period_start) DO NOTHING
      `, [company.company_id, newPeriodStart, newPeriodEnd]);
    }

    await client.query('COMMIT');

    logger.info(`Monthly usage reset for ${companies.rows.length} companies`);
    
    return {
      success: true,
      companies_reset: companies.rows.length
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Reset monthly usage error:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = exports;