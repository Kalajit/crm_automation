const pool = require('../../config/database');

async function calculateLeadScore(lead_id) {
  try {
    const leadData = await pool.query(`
      SELECT 
        l.*,
        COUNT(DISTINCT cl.id) as total_calls,
        COUNT(DISTINCT wm.id) as total_messages,
        AVG((cl.sentiment->>'tone_score')::int) as avg_sentiment,
        COUNT(DISTINCT b.id) as total_bookings,
        COUNT(DISTINCT i.id) as total_invoices,
        MAX(cl.created_at) as last_call_date,
        MAX(wm.timestamp) as last_message_date
      FROM leads l
      LEFT JOIN call_logs cl ON l.id = cl.lead_id
      LEFT JOIN whatsapp_messages wm ON l.id = wm.lead_id
      LEFT JOIN bookings b ON l.id = b.lead_id
      LEFT JOIN invoices i ON i.lead_id = l.id
      WHERE l.id = $1
      GROUP BY l.id
    `, [lead_id]);
    
    if (leadData.rows.length === 0) {
      throw new Error('Lead not found');
    }
    
    const lead = leadData.rows[0];
    
    let score = 0;
    const breakdown = {};
    
    // 1. Engagement Score (30 points)
    const callScore = Math.min((lead.total_calls || 0) * 5, 15);
    const messageScore = Math.min((lead.total_messages || 0) * 0.5, 15);
    breakdown.engagement = callScore + messageScore;
    score += breakdown.engagement;
    
    // 2. Interest Level (20 points)
    breakdown.interest = (lead.interest_level || 1) * 2;
    score += breakdown.interest;
    
    // 3. Sentiment Score (20 points)
    if (lead.avg_sentiment) {
      breakdown.sentiment = (lead.avg_sentiment / 10) * 20;
      score += breakdown.sentiment;
    } else {
      breakdown.sentiment = 10;
      score += 10;
    }
    
    // 4. Conversion Indicators (20 points)
    const bookingPoints = (lead.total_bookings || 0) * 5;
    const invoicePoints = (lead.total_invoices || 0) * 5;
    breakdown.conversion = Math.min(bookingPoints + invoicePoints, 20);
    score += breakdown.conversion;
    
    // 5. Recency (10 points)
    const now = new Date();
    const lastInteraction = lead.last_call_date || lead.last_message_date || lead.last_contacted;
    
    if (lastInteraction) {
      const daysSince = (now - new Date(lastInteraction)) / (1000 * 60 * 60 * 24);
      
      if (daysSince <= 1) breakdown.recency = 10;
      else if (daysSince <= 3) breakdown.recency = 8;
      else if (daysSince <= 7) breakdown.recency = 5;
      else if (daysSince <= 14) breakdown.recency = 3;
      else breakdown.recency = 1;
      
      score += breakdown.recency;
    } else {
      breakdown.recency = 0;
    }
    
    score = Math.min(Math.round(score), 100);
    
    let grade;
    if (score >= 80) grade = 'A';
    else if (score >= 60) grade = 'B';
    else if (score >= 40) grade = 'C';
    else if (score >= 20) grade = 'D';
    else grade = 'F';
    
    await pool.query(`
      UPDATE leads
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{lead_score}',
        $1::jsonb
      )
      WHERE id = $2
    `, [
      JSON.stringify({
        score,
        grade,
        breakdown,
        calculated_at: new Date().toISOString()
      }),
      lead_id
    ]);
    
    return { score, grade, breakdown };
  } catch (error) {
    console.error('Lead scoring error:', error);
    throw error;
  }
}

module.exports = {
  calculateLeadScore
};