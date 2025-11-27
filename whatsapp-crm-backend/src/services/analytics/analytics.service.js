// src/services/analytics/analytics.service.js

const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

class AnalyticsService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get real-time dashboard metrics
   */
  async getRealTimeDashboard(companyId, timeRange = '24h') {
    try {
      const timeRanges = {
        '1h': '1 hour',
        '24h': '24 hours',
        '7d': '7 days',
        '30d': '30 days'
      };

      const interval = timeRanges[timeRange] || '24 hours';

      const query = `
        WITH time_window AS (
          SELECT NOW() - INTERVAL '${interval}' as start_time
        ),
        call_metrics AS (
          SELECT 
            COUNT(*) as total_calls,
            COUNT(*) FILTER (WHERE call_status = 'completed') as completed_calls,
            COUNT(*) FILTER (WHERE call_status = 'failed') as failed_calls,
            COUNT(*) FILTER (WHERE call_status = 'in-progress') as active_calls,
            AVG(call_duration) FILTER (WHERE call_status = 'completed') as avg_call_duration,
            SUM(call_duration) FILTER (WHERE call_status = 'completed') as total_talk_time
          FROM call_logs, time_window
          WHERE company_id = $1 
          AND created_at >= time_window.start_time
        ),
        lead_metrics AS (
          SELECT 
            COUNT(*) as new_leads,
            COUNT(*) FILTER (WHERE lead_status = 'qualified') as qualified_leads,
            COUNT(*) FILTER (WHERE lead_status = 'converted') as converted_leads,
            COUNT(DISTINCT lead_source) as active_sources
          FROM leads, time_window
          WHERE company_id = $1 
          AND created_at >= time_window.start_time
        ),
        message_metrics AS (
          SELECT 
            COUNT(*) as total_messages,
            COUNT(DISTINCT wm.lead_id) as engaged_leads
          FROM whatsapp_messages wm
          JOIN leads l ON wm.lead_id = l.id
          CROSS JOIN time_window
          WHERE l.company_id = $1 
          AND wm.created_at >= time_window.start_time
        ),
        revenue_metrics AS (
          SELECT 
            COUNT(*) FILTER (WHERE status = 'paid') as paid_invoices,
            SUM(amount) FILTER (WHERE status = 'paid') as revenue,
            COUNT(*) FILTER (WHERE status = 'pending') as pending_invoices,
            SUM(amount) FILTER (WHERE status = 'pending') as pending_revenue
          FROM invoices i
          JOIN leads l ON i.lead_id = l.id
          CROSS JOIN time_window
          WHERE l.company_id = $1 
          AND i.created_at >= time_window.start_time
        ),
        agent_metrics AS (
          SELECT 
            COUNT(DISTINCT assigned_to_agent) as active_agents,
            COUNT(*) as assigned_leads
          FROM leads, time_window
          WHERE company_id = $1 
          AND assigned_to_agent IS NOT NULL
          AND last_contacted >= time_window.start_time
        )
        SELECT 
          json_build_object(
            'calls', cm.*,
            'leads', lm.*,
            'messages', mm.*,
            'revenue', rm.*,
            'agents', am.*
          ) as metrics
        FROM call_metrics cm, lead_metrics lm, message_metrics mm, 
             revenue_metrics rm, agent_metrics am
      `;

      const result = await this.pool.query(query, [companyId]);
      return result.rows[0].metrics;
    } catch (error) {
      logger.error('Error in getRealTimeDashboard:', error);
      throw error;
    }
  }

  /**
   * Get real-time activity stream
   */
  async getRealTimeActivity(companyId, limit = 50) {
    try {
      const query = `
        SELECT 
          af.id,
          af.activity_type,
          af.activity_description,
          af.metadata,
          af.created_at,
          l.name as lead_name,
          l.phone_number,
          ha.name as agent_name
        FROM activity_feed af
        LEFT JOIN leads l ON af.lead_id = l.id
        LEFT JOIN human_agents ha ON af.agent_id = ha.id
        WHERE af.company_id = $1
        ORDER BY af.created_at DESC
        LIMIT $2
      `;

      const result = await this.pool.query(query, [companyId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getRealTimeActivity:', error);
      throw error;
    }
  }

  /**
   * Get sales pipeline metrics
   */
  async getPipelineMetrics(companyId, startDate = null, endDate = null) {
    try {
      const dateFilter = startDate && endDate 
        ? `AND created_at BETWEEN $2 AND $3`
        : '';
      
      const params = [companyId];
      if (startDate && endDate) {
        params.push(startDate, endDate);
      }

      const query = `
        WITH funnel_stages AS (
          SELECT 
            lead_status,
            COUNT(*) as count,
            AVG(interest_level) as avg_interest,
            COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
          FROM leads
          WHERE company_id = $1 ${dateFilter}
          GROUP BY lead_status
        ),
        conversion_rates AS (
          SELECT 
            lead_source,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE lead_status = 'qualified') as qualified,
            COUNT(*) FILTER (WHERE lead_status = 'converted') as converted,
            ROUND(
              COUNT(*) FILTER (WHERE lead_status = 'qualified')::numeric / 
              NULLIF(COUNT(*), 0) * 100, 2
            ) as qualification_rate,
            ROUND(
              COUNT(*) FILTER (WHERE lead_status = 'converted')::numeric / 
              NULLIF(COUNT(*), 0) * 100, 2
            ) as conversion_rate
          FROM leads
          WHERE company_id = $1 ${dateFilter}
          GROUP BY lead_source
        ),
        time_to_convert AS (
          SELECT 
            lead_source,
            AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400) as avg_days_to_convert
          FROM leads
          WHERE company_id = $1 
          AND lead_status = 'converted'
          ${dateFilter}
          GROUP BY lead_source
        )
        SELECT 
          json_build_object(
            'funnel', (SELECT json_agg(row_to_json(fs)) FROM funnel_stages fs),
            'conversion_rates', (SELECT json_agg(row_to_json(cr)) FROM conversion_rates cr),
            'time_to_convert', (SELECT json_agg(row_to_json(ttc)) FROM time_to_convert ttc)
          ) as pipeline_data
      `;

      const result = await this.pool.query(query, params);
      return result.rows[0].pipeline_data;
    } catch (error) {
      logger.error('Error in getPipelineMetrics:', error);
      throw error;
    }
  }

  /**
   * Get lead velocity
   */
  async getLeadVelocity(companyId, days = 30) {
    try {
      const query = `
        WITH daily_stats AS (
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as new_leads,
            COUNT(*) FILTER (WHERE lead_status = 'qualified') as qualified,
            COUNT(*) FILTER (WHERE lead_status = 'converted') as converted
          FROM leads
          WHERE company_id = $1
          AND created_at >= NOW() - INTERVAL '${days} days'
          GROUP BY DATE(created_at)
          ORDER BY date
        )
        SELECT 
          date,
          new_leads,
          qualified,
          converted,
          SUM(new_leads) OVER (ORDER BY date) as cumulative_leads,
          SUM(qualified) OVER (ORDER BY date) as cumulative_qualified,
          SUM(converted) OVER (ORDER BY date) as cumulative_converted
        FROM daily_stats
      `;

      const result = await this.pool.query(query, [companyId]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getLeadVelocity:', error);
      throw error;
    }
  }

  /**
   * Forecast revenue using linear regression
   */
  async forecastRevenue(companyId, forecastMonths = 3) {
    try {
      const query = `
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          SUM(amount) FILTER (WHERE status = 'paid') as revenue,
          COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
          AVG(amount) FILTER (WHERE status = 'paid') as avg_deal_size
        FROM invoices i
        JOIN leads l ON i.lead_id = l.id
        WHERE l.company_id = $1
        AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month
      `;

      const result = await this.pool.query(query, [companyId]);
      const historicalData = result.rows;

      if (historicalData.length < 3) {
        return {
          forecast: [],
          message: 'Insufficient historical data for forecasting'
        };
      }

      // Simple linear regression
      const n = historicalData.length;
      const xValues = historicalData.map((_, i) => i);
      const yValues = historicalData.map(d => parseFloat(d.revenue) || 0);

      const sumX = xValues.reduce((a, b) => a + b, 0);
      const sumY = yValues.reduce((a, b) => a + b, 0);
      const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
      const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      // Generate forecast
      const forecast = [];
      for (let i = 0; i < forecastMonths; i++) {
        const x = n + i;
        const predictedRevenue = slope * x + intercept;
        const confidenceInterval = Math.abs(predictedRevenue * 0.15);

        forecast.push({
          month: new Date(new Date().setMonth(new Date().getMonth() + i + 1)),
          predicted_revenue: Math.max(0, predictedRevenue),
          lower_bound: Math.max(0, predictedRevenue - confidenceInterval),
          upper_bound: predictedRevenue + confidenceInterval
        });
      }

      return {
        historical: historicalData,
        forecast,
        trend: slope > 0 ? 'growing' : 'declining',
        growth_rate: (slope / (sumY / n)) * 100
      };
    } catch (error) {
      logger.error('Error in forecastRevenue:', error);
      throw error;
    }
  }

  /**
   * Predict churn risk
   */
  async predictChurn(companyId) {
    try {
      const query = `
        WITH subscription_metrics AS (
          SELECT 
            ls.id as subscription_id,
            ls.lead_id,
            l.name,
            l.phone_number,
            l.email,
            ls.end_date,
            EXTRACT(DAYS FROM (ls.end_date - CURRENT_DATE)) as days_until_expiry,
            
            (SELECT COUNT(*) FROM whatsapp_messages wm 
             WHERE wm.lead_id = l.id 
             AND wm.timestamp >= NOW() - INTERVAL '30 days') as messages_30d,
            
            (SELECT COUNT(*) FROM call_logs cl 
             WHERE cl.lead_id = l.id 
             AND cl.created_at >= NOW() - INTERVAL '30 days') as calls_30d,
            
            (SELECT COUNT(*) FROM invoices i2 
             WHERE i2.lead_id = l.id 
             AND i2.status = 'paid') as total_payments,
            
            (SELECT COUNT(*) FROM invoices i2 
             WHERE i2.lead_id = l.id 
             AND i2.status = 'pending' 
             AND i2.due_date < CURRENT_DATE) as overdue_invoices,
            
            EXTRACT(DAYS FROM (CURRENT_DATE - l.last_contacted)) as days_since_contact,
            l.interest_level
            
          FROM lead_subscriptions ls
          JOIN leads l ON ls.lead_id = l.id
          WHERE l.company_id = $1
          AND ls.status = 'active'
        )
        SELECT 
          *,
          LEAST(100, GREATEST(0, 
            (days_until_expiry * -2) +
            (CASE WHEN messages_30d = 0 THEN 20 ELSE 0 END) +
            (CASE WHEN calls_30d = 0 THEN 20 ELSE 0 END) +
            (overdue_invoices * 15) +
            (CASE WHEN days_since_contact > 30 THEN 25 ELSE 0 END) +
            ((5 - interest_level) * 5)
          )) as churn_risk_score,
          
          CASE 
            WHEN days_until_expiry <= 7 OR overdue_invoices > 0 THEN 'high'
            WHEN days_until_expiry <= 30 OR messages_30d = 0 THEN 'medium'
            ELSE 'low'
          END as risk_category
          
        FROM subscription_metrics
        ORDER BY churn_risk_score DESC
      `;

      const result = await this.pool.query(query, [companyId]);
      return result.rows;
    } catch (error) {
      logger.error('Error in predictChurn:', error);
      throw error;
    }
  }

  /**
   * Build custom report
   */
  async buildCustomReport(companyId, reportConfig) {
    try {
      const {
        report_type,
        metrics,
        dimensions,
        filters,
        date_range,
        aggregation = 'sum'
      } = reportConfig;

      let query = `WITH base_data AS (`;
      
      switch (report_type) {
        case 'leads':
          query += `
            SELECT l.*, 
                   DATE_TRUNC('${dimensions.time_group || 'day'}', l.created_at) as period
            FROM leads l
            WHERE l.company_id = $1
          `;
          break;
          
        case 'calls':
          query += `
            SELECT cl.*, 
                   DATE_TRUNC('${dimensions.time_group || 'day'}', cl.created_at) as period,
                   l.lead_source, l.location
            FROM call_logs cl
            JOIN leads l ON cl.lead_id = l.id
            WHERE l.company_id = $1
          `;
          break;
          
        case 'revenue':
          query += `
            SELECT i.*, 
                   DATE_TRUNC('${dimensions.time_group || 'day'}', i.created_at) as period,
                   l.lead_source, l.location
            FROM invoices i
            JOIN leads l ON i.lead_id = l.id
            WHERE l.company_id = $1
          `;
          break;
      }

      if (date_range) {
        query += ` AND created_at BETWEEN '${date_range.start}' AND '${date_range.end}'`;
      }

      if (filters && filters.length > 0) {
        filters.forEach(filter => {
          query += ` AND ${filter.field} ${filter.operator} '${filter.value}'`;
        });
      }

      query += `) SELECT `;

      if (dimensions.group_by && dimensions.group_by.length > 0) {
        query += dimensions.group_by.join(', ') + ', ';
      }

      const metricClauses = metrics.map(metric => {
        switch (aggregation) {
          case 'count':
            return `COUNT(${metric.field}) as ${metric.alias || metric.field}_count`;
          case 'sum':
            return `SUM(${metric.field}) as ${metric.alias || metric.field}_sum`;
          case 'avg':
            return `AVG(${metric.field}) as ${metric.alias || metric.field}_avg`;
          case 'min':
            return `MIN(${metric.field}) as ${metric.alias || metric.field}_min`;
          case 'max':
            return `MAX(${metric.field}) as ${metric.alias || metric.field}_max`;
          default:
            return `${aggregation}(${metric.field}) as ${metric.alias || metric.field}`;
        }
      });

      query += metricClauses.join(', ');
      query += ` FROM base_data`;

      if (dimensions.group_by && dimensions.group_by.length > 0) {
        query += ` GROUP BY ` + dimensions.group_by.join(', ');
      }

      if (dimensions.order_by) {
        query += ` ORDER BY ${dimensions.order_by.field} ${dimensions.order_by.direction || 'DESC'}`;
      }

      const result = await this.pool.query(query, [companyId]);
      return result.rows;
    } catch (error) {
      logger.error('Error in buildCustomReport:', error);
      throw error;
    }
  }

  /**
   * Compare periods
   */
  async comparePeriods(companyId, metric, currentPeriod, previousPeriod) {
    try {
      const query = `
        WITH current_data AS (
          SELECT 
            COUNT(*) as count,
            SUM(amount) as total_amount,
            AVG(amount) as avg_amount
          FROM invoices i
          JOIN leads l ON i.lead_id = l.id
          WHERE l.company_id = $1
          AND i.created_at BETWEEN $2 AND $3
        ),
        previous_data AS (
          SELECT 
            COUNT(*) as count,
            SUM(amount) as total_amount,
            AVG(amount) as avg_amount
          FROM invoices i
          JOIN leads l ON i.lead_id = l.id
          WHERE l.company_id = $1
          AND i.created_at BETWEEN $4 AND $5
        )
        SELECT 
          cd.count as current_count,
          pd.count as previous_count,
          ROUND(((cd.count - pd.count)::numeric / NULLIF(pd.count, 0) * 100), 2) as count_change_pct,
          
          cd.total_amount as current_total,
          pd.total_amount as previous_total,
          ROUND(((cd.total_amount - pd.total_amount)::numeric / NULLIF(pd.total_amount, 0) * 100), 2) as total_change_pct,
          
          cd.avg_amount as current_avg,
          pd.avg_amount as previous_avg,
          ROUND(((cd.avg_amount - pd.avg_amount)::numeric / NULLIF(pd.avg_amount, 0) * 100), 2) as avg_change_pct
        FROM current_data cd, previous_data pd
      `;

      const result = await this.pool.query(query, [
        companyId,
        currentPeriod.start,
        currentPeriod.end,
        previousPeriod.start,
        previousPeriod.end
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error in comparePeriods:', error);
      throw error;
    }
  }

  /**
   * Export to CSV
   */
  async exportToCSV(data, fields) {
    try {
      const parser = new Parser({ fields });
      const csv = parser.parse(data);
      return csv;
    } catch (error) {
      logger.error('Error in exportToCSV:', error);
      throw error;
    }
  }

  /**
   * Export to Excel
   */
  async exportToExcel(data, sheetName = 'Report') {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(sheetName);

      if (data.length === 0) {
        throw new Error('No data to export');
      }

      const headers = Object.keys(data[0]);
      worksheet.addRow(headers);

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4A90E2' }
      };

      data.forEach(row => {
        const values = headers.map(header => row[header]);
        worksheet.addRow(values);
      });

      worksheet.columns.forEach(column => {
        column.width = 15;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;
    } catch (error) {
      logger.error('Error in exportToExcel:', error);
      throw error;
    }
  }

  /**
   * Generate PDF report
   */
  async generatePDFReport(report, data) {
    try {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const fileName = `report_${report.id}_${Date.now()}.pdf`;
        const filePath = path.join(__dirname, '../../../temp', fileName);

        if (!fs.existsSync(path.join(__dirname, '../../../temp'))) {
          fs.mkdirSync(path.join(__dirname, '../../../temp'), { recursive: true });
        }

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        doc.fontSize(20).text(report.report_type.toUpperCase(), { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`);
        doc.moveDown();
        doc.fontSize(10).text(JSON.stringify(data, null, 2));

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error('Error in generatePDFReport:', error);
      throw error;
    }
  }
}

module.exports = AnalyticsService;