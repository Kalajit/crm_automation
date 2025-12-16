const pool = require('../../config/database');
const logger = require('../../utils/logger');

// Get agent performance report
exports.getAgentPerformanceReport = async (options) => {
  try {
    const { company_id, start_date, end_date, agent_id } = options;
    
    let dateFilter = '';
    const params = [];
    let paramCount = 0;
    
    if (company_id) {
      paramCount++;
      params.push(company_id);
    }
    
    if (start_date && end_date) {
      paramCount += 2;
      params.push(start_date, end_date);
      dateFilter = ` AND l.created_at BETWEEN $${paramCount - 1} AND $${paramCount}`;
    }
    
    let agentFilter = '';
    if (agent_id) {
      paramCount++;
      params.push(agent_id);
      agentFilter = ` AND ha.id = $${paramCount}`;
    }
    
    const query = `
      SELECT 
        ha.id as agent_id,
        ha.name as agent_name,
        ha.email as agent_email,
        ha.role as agent_role,
        
        COUNT(DISTINCT l.id) as total_leads_assigned,
        COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'qualified') as qualified_leads,
        COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_won') as won_deals,
        COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_lost') as lost_deals,
        AVG(l.interest_level) as avg_lead_interest,
        
        COUNT(DISTINCT cl.id) as total_calls,
        COUNT(DISTINCT cl.id) FILTER (WHERE cl.call_status = 'completed') as completed_calls,
        AVG(cl.call_duration) FILTER (WHERE cl.call_status = 'completed') as avg_call_duration,
        COUNT(DISTINCT cl.id) FILTER (WHERE cl.sentiment->>'sentiment' = 'positive') as positive_sentiment_calls,
        
        COUNT(DISTINCT t.id) as total_tasks,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pending' AND t.due_date < NOW()) as overdue_tasks,
        AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 3600) 
          FILTER (WHERE t.status = 'completed') as avg_task_completion_hours,
        
        SUM(i.amount) FILTER (WHERE i.status = 'paid') as total_revenue,
        COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'paid') as paid_invoices,
        
        CASE 
          WHEN COUNT(DISTINCT l.id) > 0 
          THEN (COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_won')::float / COUNT(DISTINCT l.id) * 100)
          ELSE 0 
        END as win_rate,
        
        CASE 
          WHEN COUNT(DISTINCT cl.id) > 0 
          THEN (COUNT(DISTINCT cl.id) FILTER (WHERE cl.call_status = 'completed')::float / COUNT(DISTINCT cl.id) * 100)
          ELSE 0 
        END as call_completion_rate,
        
        CASE 
          WHEN COUNT(DISTINCT t.id) > 0 
          THEN (COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed')::float / COUNT(DISTINCT t.id) * 100)
          ELSE 0 
        END as task_completion_rate
        
      FROM human_agents ha
      LEFT JOIN leads l ON l.assigned_to_agent = ha.name ${company_id ? 'AND l.company_id = $1' : ''} ${dateFilter}
      LEFT JOIN call_logs cl ON l.id = cl.lead_id
      LEFT JOIN tasks t ON t.assigned_to_agent_id = ha.id
      LEFT JOIN invoices i ON l.id = i.lead_id
      WHERE 1=1 ${agentFilter}
      GROUP BY ha.id, ha.name, ha.email, ha.role
      ORDER BY total_revenue DESC, won_deals DESC
    `;
    
    const result = await pool.query(query, params);
    return result.rows;
    
  } catch (error) {
    logger.error('Agent performance report error:', error);
    throw error;
  }
};

// Get revenue forecast
exports.getRevenueForecast = async (company_id, months = 3) => {
  try {
    const historicalResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', i.created_at) as month,
        SUM(i.amount) FILTER (WHERE i.status = 'paid') as revenue,
        COUNT(DISTINCT i.lead_id) FILTER (WHERE i.status = 'paid') as customers,
        AVG(i.amount) FILTER (WHERE i.status = 'paid') as avg_deal_size,
        COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'new') as new_leads
      FROM invoices i
      JOIN leads l ON i.lead_id = l.id
      WHERE l.company_id = $1
      AND i.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', i.created_at)
      ORDER BY month DESC
    `, [company_id]);
    
    const pipelineResult = await pool.query(`
      SELECT 
        l.lead_status,
        COUNT(*) as count,
        SUM(COALESCE((l.metadata->>'expected_value')::numeric, 1000)) as pipeline_value
      FROM leads l
      WHERE l.company_id = $1
      AND l.lead_status NOT IN ('closed_won', 'closed_lost')
      GROUP BY l.lead_status
    `, [company_id]);
    
    const recentMonths = historicalResult.rows.slice(0, 6);
    const avgMonthlyRevenue = recentMonths.reduce((sum, row) => sum + parseFloat(row.revenue || 0), 0) / recentMonths.length;
    const avgMonthlyGrowth = recentMonths.length > 1 
      ? ((parseFloat(recentMonths[0].revenue) - parseFloat(recentMonths[recentMonths.length - 1].revenue)) / parseFloat(recentMonths[recentMonths.length - 1].revenue)) / recentMonths.length
      : 0.05;
    
    const forecast = [];
    let forecastRevenue = avgMonthlyRevenue;
    
    for (let i = 0; i < parseInt(months); i++) {
      const forecastDate = new Date();
      forecastDate.setMonth(forecastDate.getMonth() + i + 1);
      
      forecastRevenue *= (1 + avgMonthlyGrowth);
      
      forecast.push({
        month: forecastDate.toISOString().split('T')[0].substring(0, 7),
        forecasted_revenue: Math.round(forecastRevenue * 100) / 100,
        confidence: Math.max(0.5, 1 - (i * 0.1))
      });
    }
    
    return {
      historical_data: historicalResult.rows,
      current_pipeline: pipelineResult.rows,
      forecast: forecast,
      metrics: {
        avg_monthly_revenue: Math.round(avgMonthlyRevenue * 100) / 100,
        avg_growth_rate: Math.round(avgMonthlyGrowth * 10000) / 100,
        total_pipeline_value: pipelineResult.rows.reduce((sum, row) => sum + parseFloat(row.pipeline_value || 0), 0)
      }
    };
    
  } catch (error) {
    logger.error('Revenue forecast error:', error);
    throw error;
  }
};

// Get churn prediction
exports.getChurnPrediction = async (company_id) => {
  try {
    const atRiskResult = await pool.query(`
      SELECT 
        l.id,
        l.name,
        l.phone_number,
        l.email,
        l.lead_status,
        l.interest_level,
        
        EXTRACT(DAY FROM (NOW() - l.last_contacted)) as days_since_contact,
        COUNT(DISTINCT cl.id) as total_calls,
        COUNT(DISTINCT wm.id) as total_messages,
        MAX(cl.created_at) as last_call_date,
        MAX(wm.timestamp) as last_message_date,
        
        COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'paid') as paid_invoices,
        COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'overdue') as overdue_invoices,
        SUM(i.amount) FILTER (WHERE i.status = 'overdue') as overdue_amount,
        
        CASE
          WHEN EXTRACT(DAY FROM (NOW() - l.last_contacted)) > 30 THEN 40
          WHEN EXTRACT(DAY FROM (NOW() - l.last_contacted)) > 14 THEN 20
          ELSE 0
        END +
        CASE
          WHEN l.interest_level < 3 THEN 30
          WHEN l.interest_level < 5 THEN 15
          ELSE 0
        END +
        CASE
          WHEN COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'overdue') > 0 THEN 30
          ELSE 0
        END as churn_risk_score
        
      FROM leads l
      LEFT JOIN call_logs cl ON l.id = cl.lead_id
      LEFT JOIN whatsapp_messages wm ON l.id = wm.lead_id
      LEFT JOIN invoices i ON l.id = i.lead_id
      WHERE l.company_id = $1
      AND l.lead_status NOT IN ('closed_lost')
      GROUP BY l.id
      HAVING 
        EXTRACT(DAY FROM (NOW() - l.last_contacted)) > 14 
        OR l.interest_level < 5
        OR COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'overdue') > 0
      ORDER BY 
        CASE
          WHEN EXTRACT(DAY FROM (NOW() - l.last_contacted)) > 30 THEN 40
          WHEN EXTRACT(DAY FROM (NOW() - l.last_contacted)) > 14 THEN 20
          ELSE 0
        END +
        CASE
          WHEN l.interest_level < 3 THEN 30
          WHEN l.interest_level < 5 THEN 15
          ELSE 0
        END +
        CASE
          WHEN COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'overdue') > 0 THEN 30
          ELSE 0
        END DESC
    `, [company_id]);
    
    const highRisk = atRiskResult.rows.filter(r => r.churn_risk_score >= 60);
    const mediumRisk = atRiskResult.rows.filter(r => r.churn_risk_score >= 30 && r.churn_risk_score < 60);
    const lowRisk = atRiskResult.rows.filter(r => r.churn_risk_score < 30);
    
    return {
      summary: {
        total_at_risk: atRiskResult.rows.length,
        high_risk_count: highRisk.length,
        medium_risk_count: mediumRisk.length,
        low_risk_count: lowRisk.length
      },
      high_risk_leads: highRisk,
      medium_risk_leads: mediumRisk,
      low_risk_leads: lowRisk
    };
    
  } catch (error) {
    logger.error('Churn prediction error:', error);
    throw error;
  }
};

// Get campaign ROI analysis
exports.getCampaignROI = async (options) => {
  try {
    const { company_id, start_date, end_date } = options;
    
    let dateFilter = '';
    const params = [company_id];
    
    if (start_date && end_date) {
      params.push(start_date, end_date);
      dateFilter = ` AND campaigns.created_at BETWEEN $2 AND $3`;
    }
    
    const scheduledCampaignsResult = await pool.query(`
      SELECT 
        campaigns.id as campaign_id,
        campaigns.campaign_name,
        'scheduled_calls' as campaign_type,
        COUNT(DISTINCT sc.id) as total_contacts,
        COUNT(DISTINCT sc.id) FILTER (WHERE sc.status = 'called') as contacted,
        COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_won') as conversions,
        SUM(i.amount) FILTER (WHERE i.status = 'paid') as revenue_generated,
        0 as total_cost,
        CASE 
          WHEN COUNT(DISTINCT sc.id) FILTER (WHERE sc.status = 'called') > 0 
          THEN (COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_won')::float / COUNT(DISTINCT sc.id) FILTER (WHERE sc.status = 'called') * 100)
          ELSE 0 
        END as conversion_rate
      FROM campaigns
      LEFT JOIN scheduled_calls sc ON campaigns.id = sc.campaign_id
      LEFT JOIN leads l ON sc.lead_id = l.id
      LEFT JOIN invoices i ON l.id = i.lead_id
      WHERE campaigns.company_id = $1 ${dateFilter}
      GROUP BY campaigns.id, campaigns.campaign_name
    `, params);
    
    let dripDateFilter = '';
    if (start_date && end_date) {
      dripDateFilter = ` AND dc.created_at BETWEEN $2 AND $3`;
    }
    
    const dripCampaignsResult = await pool.query(`
      SELECT 
        dc.id as campaign_id,
        dc.campaign_name,
        'drip_campaign' as campaign_type,
        COUNT(DISTINCT dcs.id) as total_contacts,
        COUNT(DISTINCT dse.id) FILTER (WHERE dse.status = 'sent') as contacted,
        COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_won') as conversions,
        SUM(COALESCE(cp.revenue_generated, 0)) as revenue_generated,
        SUM(COALESCE(cp.total_cost, 0)) as total_cost,
        CASE 
          WHEN COUNT(DISTINCT dse.id) FILTER (WHERE dse.status = 'sent') > 0 
          THEN (COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'closed_won')::float / COUNT(DISTINCT dse.id) FILTER (WHERE dse.status = 'sent') * 100)
          ELSE 0 
        END as conversion_rate
      FROM drip_campaigns dc
      LEFT JOIN drip_campaign_subscribers dcs ON dc.id = dcs.campaign_id
      LEFT JOIN drip_step_executions dse ON dcs.id = dse.subscriber_id
      LEFT JOIN leads l ON dcs.lead_id = l.id
      LEFT JOIN campaign_performance cp ON dc.id = cp.campaign_id
      WHERE dc.company_id = $1 ${dripDateFilter}
      GROUP BY dc.id, dc.campaign_name
    `, params);
    
    const allCampaigns = [
      ...scheduledCampaignsResult.rows,
      ...dripCampaignsResult.rows
    ].map(campaign => {
      const revenue = parseFloat(campaign.revenue_generated) || 0;
      const cost = parseFloat(campaign.total_cost) || 0;
      const netProfit = revenue - cost;
      const roi = cost > 0 ? ((netProfit / cost) * 100) : 0;
      
      return {
        ...campaign,
        revenue_generated: Math.round(revenue * 100) / 100,
        total_cost: Math.round(cost * 100) / 100,
        net_profit: Math.round(netProfit * 100) / 100,
        roi: Math.round(roi * 100) / 100,
        conversion_rate: Math.round(parseFloat(campaign.conversion_rate) * 100) / 100
      };
    });
    
    allCampaigns.sort((a, b) => b.roi - a.roi);
    
    return allCampaigns;
    
  } catch (error) {
    logger.error('Campaign ROI analysis error:', error);
    throw error;
  }
};