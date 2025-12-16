const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Get dashboard overview with key metrics
 */
exports.getDashboardOverview = async (req, res) => {
  try {
    const overview = {};
    const today = new Date().toISOString().split('T')[0];

    // Calls today
    const callsToday = await pool.query(`
      SELECT COUNT(*) as total, call_status
      FROM call_logs
      WHERE DATE(created_at) = $1
      GROUP BY call_status;
    `, [today]);
    overview.calls_today = callsToday.rows;

    // Hot leads (high interest)
    const hotLeads = await pool.query(`
      SELECT COUNT(*) as count
      FROM leads
      WHERE lead_status = 'qualified'
      AND updated_at >= NOW() - INTERVAL '24 hours';
    `);
    overview.hot_leads_24h = parseInt(hotLeads.rows[0].count);

    // Failed calls today
    const failedCalls = await pool.query(`
      SELECT COUNT(*) as count
      FROM call_logs
      WHERE call_status = 'failed'
      AND DATE(created_at) = $1;
    `, [today]);
    overview.failed_calls_today = parseInt(failedCalls.rows[0].count);

    // Active calls right now
    const activeCalls = await pool.query(`
      SELECT COUNT(*) as count
      FROM call_logs
      WHERE call_status IN ('initiated', 'in-progress', 'ringing')
      AND created_at >= NOW() - INTERVAL '1 hour';
    `);
    overview.active_calls = parseInt(activeCalls.rows[0].count);

    // Pending scheduled calls
    const pendingCalls = await pool.query(`
      SELECT COUNT(*) as count
      FROM scheduled_calls
      WHERE status = 'pending'
      AND scheduled_time <= NOW() + INTERVAL '24 hours';
    `);
    overview.pending_calls_24h = parseInt(pendingCalls.rows[0].count);

    logRequest('GET', '/api/dashboard/overview', 200);
    sendSuccess(res, { data: overview });
  } catch (error) {
    logRequest('GET', '/api/dashboard/overview', 500);
    handleError(res, error);
  }
};





// ============================================
// SALES PERFORMANCE DASHBOARD
// ============================================

exports.getPipeline = async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    const params = [company_id];
    let dateFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      params.push(start_date, end_date);
    }
    
    const pipelineQuery = `
      SELECT 
        l.lead_status,
        COUNT(*) as count,
        COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter}
      GROUP BY l.lead_status
      ORDER BY 
        CASE l.lead_status
          WHEN 'new' THEN 1
          WHEN 'contacted' THEN 2
          WHEN 'qualified' THEN 3
          WHEN 'demo_scheduled' THEN 4
          WHEN 'proposal_sent' THEN 5
          WHEN 'negotiation' THEN 6
          WHEN 'closed_won' THEN 7
          WHEN 'closed_lost' THEN 8
          ELSE 9
        END
    `;
    
    const pipeline = await pool.query(pipelineQuery, params);
    
    const conversionQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE lead_status = 'new') as new_leads,
        COUNT(*) FILTER (WHERE lead_status = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE lead_status = 'qualified') as qualified,
        COUNT(*) FILTER (WHERE lead_status IN ('demo_scheduled', 'proposal_sent')) as in_negotiation,
        COUNT(*) FILTER (WHERE lead_status = 'closed_won') as closed_won,
        COUNT(*) FILTER (WHERE lead_status = 'closed_lost') as closed_lost
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter}
    `;
    
    const conversion = await pool.query(conversionQuery, params);
    const stats = conversion.rows[0];
    
    const conversionRates = {
      new_to_contacted: stats.new_leads > 0 ? ((stats.contacted / stats.new_leads) * 100).toFixed(1) : 0,
      contacted_to_qualified: stats.contacted > 0 ? ((stats.qualified / stats.contacted) * 100).toFixed(1) : 0,
      qualified_to_negotiation: stats.qualified > 0 ? ((stats.in_negotiation / stats.qualified) * 100).toFixed(1) : 0,
      negotiation_to_won: stats.in_negotiation > 0 ? ((stats.closed_won / stats.in_negotiation) * 100).toFixed(1) : 0,
      overall_win_rate: (stats.closed_won + stats.closed_lost) > 0 ? ((stats.closed_won / (stats.closed_won + stats.closed_lost)) * 100).toFixed(1) : 0
    };
    
    logRequest('GET', '/api/dashboard/pipeline', 200);
    res.json({
      success: true,
      data: {
        pipeline: pipeline.rows,
        stats: stats,
        conversion_rates: conversionRates
      }
    });
  } catch (error) {
    logRequest('GET', '/api/dashboard/pipeline', 500);
    handleError(res, error);
  }
};



exports.getPipelineOverview = async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    const params = [company_id];
    let dateFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      params.push(start_date, end_date);
    }
    
    const pipelineQuery = `
      SELECT 
        l.lead_status,
        COUNT(*) as count,
        COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter}
      GROUP BY l.lead_status
      ORDER BY 
        CASE l.lead_status
          WHEN 'new' THEN 1
          WHEN 'contacted' THEN 2
          WHEN 'qualified' THEN 3
          WHEN 'demo_scheduled' THEN 4
          WHEN 'proposal_sent' THEN 5
          WHEN 'negotiation' THEN 6
          WHEN 'closed_won' THEN 7
          WHEN 'closed_lost' THEN 8
          ELSE 9
        END
    `;
    
    const pipeline = await pool.query(pipelineQuery, params);
    
    const conversionQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE lead_status = 'new') as new_leads,
        COUNT(*) FILTER (WHERE lead_status = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE lead_status = 'qualified') as qualified,
        COUNT(*) FILTER (WHERE lead_status IN ('demo_scheduled', 'proposal_sent')) as in_negotiation,
        COUNT(*) FILTER (WHERE lead_status = 'closed_won') as closed_won,
        COUNT(*) FILTER (WHERE lead_status = 'closed_lost') as closed_lost
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter}
    `;
    
    const conversion = await pool.query(conversionQuery, params);
    const stats = conversion.rows[0];
    
    const conversionRates = {
      new_to_contacted: stats.new_leads > 0 ? ((stats.contacted / stats.new_leads) * 100).toFixed(1) : 0,
      contacted_to_qualified: stats.contacted > 0 ? ((stats.qualified / stats.contacted) * 100).toFixed(1) : 0,
      qualified_to_negotiation: stats.qualified > 0 ? ((stats.in_negotiation / stats.qualified) * 100).toFixed(1) : 0,
      negotiation_to_won: stats.in_negotiation > 0 ? ((stats.closed_won / stats.in_negotiation) * 100).toFixed(1) : 0,
      overall_win_rate: (stats.closed_won + stats.closed_lost) > 0 ? ((stats.closed_won / (stats.closed_won + stats.closed_lost)) * 100).toFixed(1) : 0
    };
    
    logRequest('GET', '/api/dashboard/pipeline-overview', 200);
    res.json({
      success: true,
      data: {
        pipeline: pipeline.rows,
        stats: stats,
        conversion_rates: conversionRates
      }
    });
  } catch (error) {
    logRequest('GET', '/api/dashboard/pipeline-overview', 500);
    handleError(res, error);
  }
};





exports.getSalesPerformance = async (req, res) => {
  try {
    const { company_id, start_date, end_date, agent_id } = req.query;
    
    const params = [company_id];
    let dateFilter = '';
    let agentFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      params.push(start_date, end_date);
    }
    
    if (agent_id) {
      agentFilter = ` AND l.assigned_to_agent = $${params.length + 1}`;
      params.push(agent_id);
    }
    
    const metricsQuery = `
      SELECT 
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_won') as won_deals,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_lost') as lost_deals,
        AVG(l.interest_level) as avg_interest_level,
        COUNT(DISTINCT DATE(l.created_at)) as days_active
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter} ${agentFilter}
    `;
    
    const metrics = await pool.query(metricsQuery, params);
    
    const callParams = [company_id];
    let callDateFilter = '';
    
    if (start_date && end_date) {
      callDateFilter = ' AND cl.created_at BETWEEN $2 AND $3';
      callParams.push(start_date, end_date);
    }
    
    const callQuery = `
      SELECT 
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE cl.call_status = 'completed') as completed_calls,
        COUNT(*) FILTER (WHERE cl.call_status = 'failed') as failed_calls,
        AVG(cl.call_duration) as avg_duration,
        COUNT(*) FILTER (WHERE cl.sentiment->>'sentiment' = 'positive') as positive_calls,
        COUNT(*) FILTER (WHERE cl.sentiment->>'sentiment' = 'negative') as negative_calls
      FROM call_logs cl
      WHERE cl.company_id = $1 ${callDateFilter}
    `;
    
    const callPerf = await pool.query(callQuery, callParams);
    
    const msgParams = [company_id];
    let msgDateFilter = '';
    
    if (start_date && end_date) {
      msgDateFilter = ' AND wm.timestamp BETWEEN $2 AND $3';
      msgParams.push(start_date, end_date);
    }
    
    const msgQuery = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT wm.lead_id) as unique_leads_messaged,
        AVG(CASE WHEN wm.is_from_user THEN 1 ELSE 0 END) as user_message_ratio
      FROM whatsapp_messages wm
      JOIN leads l ON wm.lead_id = l.id
      WHERE l.company_id = $1 ${msgDateFilter}
    `;
    
    const msgPerf = await pool.query(msgQuery, msgParams);
    
    const responseQuery = `
      WITH response_times AS (
        SELECT 
          wm.lead_id,
          wm.timestamp,
          LAG(wm.timestamp) OVER (PARTITION BY wm.lead_id ORDER BY wm.timestamp) as prev_timestamp,
          wm.is_from_user
        FROM whatsapp_messages wm
        WHERE wm.lead_id IN (SELECT id FROM leads WHERE company_id = $1)
      )
      SELECT 
        AVG(EXTRACT(EPOCH FROM (timestamp - prev_timestamp))) as avg_response_time_seconds
      FROM response_times
      WHERE is_from_user = FALSE AND prev_timestamp IS NOT NULL
    `;
    
    const responseTime = await pool.query(responseQuery, [company_id]);
    
    logRequest('GET', '/api/dashboard/sales-performance', 200);
    res.json({
      success: true,
      data: {
        sales_metrics: metrics.rows[0],
        call_performance: callPerf.rows[0],
        message_performance: msgPerf.rows[0],
        avg_response_time_minutes: responseTime.rows[0].avg_response_time_seconds 
          ? (responseTime.rows[0].avg_response_time_seconds / 60).toFixed(1) 
          : 0
      }
    });
  } catch (error) {
    logRequest('GET', '/api/dashboard/sales-performance', 500);
    handleError(res, error);
  }
};




exports.getLeadSources = async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    const params = [company_id];
    let dateFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      params.push(start_date, end_date);
    }
    
    const sourceQuery = `
      SELECT 
        l.lead_source,
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_won') as converted_leads,
        AVG(l.interest_level) as avg_interest,
        (COUNT(*) FILTER (WHERE l.lead_status = 'closed_won')::float / 
         NULLIF(COUNT(*), 0) * 100) as conversion_rate
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter}
      GROUP BY l.lead_source
      ORDER BY total_leads DESC
    `;
    
    const sources = await pool.query(sourceQuery, params);
    
    const platformParams = [company_id];
    let platformDateFilter = '';
    
    if (start_date && end_date) {
      platformDateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      platformParams.push(start_date, end_date);
    }
    
    const platformQuery = `
      SELECT 
        lsc.platform,
        lsc.form_name,
        COUNT(l.id) as total_leads,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_won') as converted_leads,
        COUNT(DISTINCT lil.id) FILTER (WHERE lil.status = 'success') as successful_imports,
        COUNT(DISTINCT lil.id) FILTER (WHERE lil.status = 'failed') as failed_imports,
        COUNT(DISTINCT lil.id) FILTER (WHERE lil.status = 'duplicate') as duplicate_imports
      FROM lead_source_configs lsc
      LEFT JOIN leads l ON l.lead_source_config_id = lsc.id ${platformDateFilter}
      LEFT JOIN lead_import_logs lil ON lil.form_id = lsc.form_id
      WHERE lsc.company_id = $1 AND lsc.is_active = TRUE
      GROUP BY lsc.platform, lsc.form_name, lsc.id
      ORDER BY total_leads DESC
    `;
    
    const platforms = await pool.query(platformQuery, platformParams);
    
    logRequest('GET', '/api/dashboard/lead-sources', 200);
    res.json({
      success: true,
      data: {
        sources: sources.rows,
        platforms: platforms.rows
      }
    });
  } catch (error) {
    logRequest('GET', '/api/dashboard/lead-sources', 500);
    handleError(res, error);
  }
};



exports.getAgentLeaderboard = async (req, res) => {
  try {
    const { company_id, start_date, end_date } = req.query;
    
    const params = [company_id];
    let dateFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      params.push(start_date, end_date);
    }
    
    const leaderboardQuery = `
      SELECT 
        l.assigned_to_agent as agent_name,
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_won') as won_deals,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_lost') as lost_deals,
        AVG(l.interest_level) as avg_interest,
        (COUNT(*) FILTER (WHERE l.lead_status = 'closed_won')::float / 
         NULLIF(COUNT(*), 0) * 100) as win_rate,
        COUNT(DISTINCT cl.id) as total_calls,
        AVG(cl.call_duration) as avg_call_duration,
        COUNT(DISTINCT wm.id) as total_messages
      FROM leads l
      LEFT JOIN call_logs cl ON l.id = cl.lead_id
      LEFT JOIN whatsapp_messages wm ON l.id = wm.lead_id AND wm.is_from_user = FALSE
      WHERE l.company_id = $1 
        AND l.assigned_to_agent IS NOT NULL
        ${dateFilter}
      GROUP BY l.assigned_to_agent
      ORDER BY won_deals DESC, win_rate DESC
      LIMIT 20
    `;
    
    const leaderboard = await pool.query(leaderboardQuery, params);
    
    logRequest('GET', '/api/dashboard/agent-leaderboard', 200);
    res.json({
      success: true,
      data: leaderboard.rows
    });
  } catch (error) {
    logRequest('GET', '/api/dashboard/agent-leaderboard', 500);
    handleError(res, error);
  }
};



exports.getTrends = async (req, res) => {
  try {
    const { company_id, start_date, end_date, interval } = req.query;
    
    const groupBy = interval === 'week' ? 'week' : interval === 'month' ? 'month' : 'day';
    
    const params = [company_id];
    let dateFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND l.created_at BETWEEN $2 AND $3';
      params.push(start_date, end_date);
    }
    
    const leadTrendsQuery = `
      SELECT 
        DATE_TRUNC('${groupBy}', l.created_at) as period,
        COUNT(*) as new_leads,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_won') as won_deals,
        COUNT(*) FILTER (WHERE l.lead_status = 'closed_lost') as lost_deals,
        AVG(l.interest_level) as avg_interest
      FROM leads l
      WHERE l.company_id = $1 ${dateFilter}
      GROUP BY DATE_TRUNC('${groupBy}', l.created_at)
      ORDER BY period ASC
      `;
    
    const leadTrends= await pool.query(leadTrendsQuery, params);

    const callDateFilter = start_date && end_date ? ' AND cl.created_at BETWEEN $2 AND $3' : '';

    const callTrendsQuery=`
    SELECT 
      DATE_TRUNC('${groupBy}', cl.created_at) as period,
      COUNT(*) as total_calls,
      COUNT(*) FILTER (WHERE cl.call_status = 'completed') as completed_calls,
      AVG(cl.call_duration) as avg_duration
    FROM call_logs cl
    WHERE cl.company_id= $1 ${callDateFilter}
    GROUP BY DATE_TRUNC ('${groupBy}',cl.created_at)
    ORDER BY period ASC 
      `;

    const callTrends=await pool.query(callTrendsQuery, params);

    logRequest('GET', '/api/dashboard/trends', 200);
    res.json({
      success:true,
      data: {
        lead_trends: leadTrends.rows,
        call_trends: callTrends.rows
      }
    });


  }catch(error){
    logRequest('GET','/api/dashboard/trends',500);
    handleError(res,error);

  }
};




exports.getRevenue=async(req, res)=> {
  try{
    const{company_id,start_date, end_date}=req.query;
    const params= [company_id];
    let dateFilter= '';

    if ( start_date && end_date){
      dateFilter= 'AND i.created_at BETWEEN $2 AND $3';
      params.push(start_date, end_date);
    }

    const revenueQuery = `
      SELECT 
        SUM(i.amount) FILTER (WHERE i.status = 'paid') as total_revenue,
        SUM(i.amount) FILTER (WHERE i.status = 'pending') as pending_revenue,
        SUM(i.amount) FILTER (WHERE i.status = 'overdue') as overdue_revenue,
        COUNT(*) FILTER (WHERE i.status = 'paid') as paid_invoices,
        COUNT(*) FILTER (WHERE i.status = 'pending') as pending_invoices,
        AVG(i.amount) as avg_invoice_value,
        SUM(i.amount) FILTER (WHERE i.invoice_type = 'subscription') as recurring_revenue,
        SUM(i.amount) FILTER (WHERE i.invoice_type = 'one_time') as one_time_revenue
      FROM invoices i
      WHERE i.lead_id IN (SELECT id FROM leads WHERE company_id = $1)
      ${dateFilter}
    `;

    const revenue= await pool.query(revenueQuery, params);

    const mrrQuery = `
      SELECT 
        DATE_TRUNC('month', i.created_at) as month,
        SUM(i.amount) FILTER (WHERE i.invoice_type = 'subscription' AND i.status = 'paid') as mrr
      FROM invoices i
      WHERE i.lead_id IN (SELECT id FROM leads WHERE company_id = $1)
      GROUP BY DATE_TRUNC('month', i.created_at)
      ORDER BY month DESC
      LIMIT 12
    `;

    const mrr = await pool.query(mrrQuery, [company_id]);

    logRequest('GET', '/api/dashboard/revenue', 200);
    res.json({
      success: true,
      data: {
        revenue_summary: revenue.rows[0],
        mrr_trend: mrr.rows
      }
    });
  }catch(error){
    logRequest('GET', '/api/dashboard/revenue',500);
    handleError(res,error);
  }
};