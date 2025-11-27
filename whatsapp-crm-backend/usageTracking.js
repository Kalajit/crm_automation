// File: middleware/usageTracking.js

async function trackUsage(pool, companyId, eventType, quantity = 1, metadata = {}) {
  try {
    // Log the event
    await pool.query(`
      INSERT INTO usage_events (company_id, event_type, quantity, metadata)
      VALUES ($1, $2, $3, $4)
    `, [companyId, eventType, quantity, JSON.stringify(metadata)]);
    
    // Update current period usage
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
    console.error('Usage tracking error:', error);
    // Don't throw - usage tracking shouldn't block operations
  }
}

function getUsageColumn(eventType) {
  const mapping = {
    'whatsapp_message': 'whatsapp_messages_sent',
    'voice_call': 'voice_minutes_used',
    'lead_created': 'leads_created',
    'ai_token': 'ai_tokens_used'
  };
  return mapping[eventType] || 'whatsapp_messages_sent';
}

async function checkUsageLimit(pool, companyId, eventType) {
  try {
    // Get company subscription and limits
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
    
    // Check limits
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
    console.error('Usage limit check error:', error);
    // Allow on error to avoid blocking operations
    return { allowed: true };
  }
}

module.exports = {
  trackUsage,
  checkUsageLimit
};