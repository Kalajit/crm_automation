const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Create campaign with bulk scheduled calls
 */
exports.createCampaign = async (req, res) => {
  try {
    const { company_id, campaign_name, campaign_type, target_leads, scheduled_start, call_rate_per_minute } = req.body;

    if (!company_id || !campaign_name || !target_leads) {
      return res.status(400).json({ error: 'company_id, campaign_name, and target_leads are required' });
    }

    // Create campaign
    const query = `
      INSERT INTO campaigns (
        company_id, campaign_name, campaign_type, 
        total_leads, scheduled_start, call_rate_per_minute, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
      RETURNING *;
    `;

    const result = await pool.query(query, [
      company_id,
      campaign_name,
      campaign_type || 'outbound',
      target_leads.length,
      scheduled_start || new Date().toISOString(),
      call_rate_per_minute || 1
    ]);

    const campaign_id = result.rows[0].id;

    // Bulk insert scheduled calls
    const values = target_leads.map((lead, idx) => 
      `(${company_id}, ${lead.lead_id}, '${campaign_type}', '${scheduled_start}', ${campaign_id})`
    ).join(',');

    await pool.query(`
      INSERT INTO scheduled_calls (company_id, lead_id, call_type, scheduled_time, campaign_id)
      VALUES ${values}
    `);

    logRequest('POST', '/api/campaigns', 201);
    res.status(201).json({ 
      success: true, 
      campaign_id: campaign_id,
      scheduled_calls: target_leads.length,
      message: `Campaign created with ${target_leads.length} calls scheduled`
    });
  } catch (error) {
    logRequest('POST', '/api/campaigns', 500);
    handleError(res, error);
  }
};

/**
 * Get campaign statistics
 */
exports.getCampaignStats = async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await pool.query(`
      SELECT 
        c.campaign_name, c.total_leads, c.status as campaign_status,
        COUNT(sc.id) FILTER (WHERE sc.status = 'pending') as pending,
        COUNT(sc.id) FILTER (WHERE sc.status = 'called') as called,
        COUNT(cl.id) FILTER (WHERE cl.call_status = 'completed') as completed,
        COUNT(cl.id) FILTER (WHERE cl.call_status = 'failed') as failed,
        AVG(cl.call_duration) as avg_duration
      FROM campaigns c
      LEFT JOIN scheduled_calls sc ON c.id = sc.campaign_id
      LEFT JOIN call_logs cl ON sc.call_sid = cl.call_sid
      WHERE c.id = $1
      GROUP BY c.id
    `, [id]);

    if (stats.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    logRequest('GET', `/api/campaigns/${id}/stats`, 200);
    sendSuccess(res, { data: stats.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/campaigns/${id}/stats`, 500);
    handleError(res, error);
  }
};