const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Create takeover request
 */
exports.createTakeoverRequest = async (req, res) => {
  try {
    const {
      lead_id, company_id, call_sid, conversation_id, request_type,
      trigger_reason, ai_sentiment, ai_summary, conversation_context, priority
    } = req.body;

    if (!lead_id || !request_type || !trigger_reason) {
      return res.status(400).json({ error: 'lead_id, request_type, and trigger_reason are required' });
    }

    // Find best available agent
    const agent = await pool.query(`
      SELECT id, name, email, phone
      FROM human_agents
      WHERE status = 'available'
      AND assigned_leads < max_concurrent_leads
      AND (expertise @> ARRAY[$1] OR role = 'senior_rep')
      ORDER BY assigned_leads ASC, RANDOM()
      LIMIT 1
    `, [trigger_reason]);

    const assigned_agent_id = agent.rows.length > 0 ? agent.rows[0].id : null;

    // Create takeover request
    const query = `
      INSERT INTO takeover_requests (
        lead_id, company_id, call_sid, conversation_id,
        request_type, trigger_reason, ai_sentiment, ai_summary,
        conversation_context, priority, assigned_agent_id,
        status, assigned_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      lead_id, company_id || null, call_sid || null, conversation_id || null,
      request_type, trigger_reason,
      ai_sentiment ? JSON.stringify(ai_sentiment) : null, ai_summary || null,
      conversation_context || null, priority || 'medium', assigned_agent_id,
      assigned_agent_id ? 'assigned' : 'pending',
      assigned_agent_id ? new Date().toISOString() : null
    ]);

    // Update agent's assigned count
    if (assigned_agent_id) {
      await pool.query(`
        UPDATE human_agents
        SET assigned_leads = assigned_leads + 1,
            status = CASE WHEN assigned_leads + 1 >= max_concurrent_leads THEN 'busy' ELSE 'available' END
        WHERE id = $1
      `, [assigned_agent_id]);

      // Send notification to agent
      const agentData = agent.rows[0];
      await pool.query(`
        INSERT INTO notifications (
          lead_id, phone_number, notification_type, title, message,
          scheduled_time, delivery_channel
        )
        VALUES ($1, $2, 'takeover_alert', $3, $4, CURRENT_TIMESTAMP, 'whatsapp')
      `, [
        lead_id, agentData.phone, '🔥 New Lead Takeover',
        `Urgent: ${trigger_reason} lead assigned to you. Lead ID: ${lead_id}. Check dashboard now!`
      ]);
    }

    logRequest('POST', '/api/takeover/request', 201);
    res.status(201).json({ success: true, data: result.rows[0], agent: agent.rows[0] || null });
  } catch (error) {
    logRequest('POST', '/api/takeover/request', 500);
    handleError(res, error);
  }
};

/**
 * Get my takeover requests
 */
exports.getMyTakeoverRequests = async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status } = req.query;

    let query = `
      SELECT 
        tr.*, l.name as lead_name, l.phone_number, l.email, l.chess_rating, l.location,
        c.conversation_history, ha.name as agent_name
      FROM takeover_requests tr
      JOIN leads l ON tr.lead_id = l.id
      LEFT JOIN conversations c ON tr.conversation_id = c.id
      LEFT JOIN human_agents ha ON tr.assigned_agent_id = ha.id
      WHERE tr.assigned_agent_id = $1
    `;

    const params = [agent_id];

    if (status) {
      params.push(status);
      query += ` AND tr.status = $${params.length}`;
    } else {
      query += ` AND tr.status IN ('pending', 'assigned', 'in_progress')`;
    }

    query += ' ORDER BY tr.priority DESC, tr.created_at ASC;';
    const result = await pool.query(query, params);

    logRequest('GET', `/api/takeover/my-requests/${agent_id}`, 200);
    sendSuccess(res, { count: result.rows.length, data: result.rows });
  } catch (error) {
    logRequest('GET', `/api/takeover/my-requests/${agent_id}`, 500);
    handleError(res, error);
  }
};

/**
 * Accept takeover
 */
exports.acceptTakeover = async (req, res) => {
  try {
    const { id } = req.params;
    const { agent_id } = req.body;

    const takeover = await pool.query('SELECT * FROM takeover_requests WHERE id = $1', [id]);

    if (takeover.rows.length === 0) {
      return res.status(404).json({ error: 'Takeover request not found' });
    }

    const tr = takeover.rows[0];

    // Update takeover status
    await pool.query(`
      UPDATE takeover_requests
      SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    // Create human session
    await pool.query(`
      INSERT INTO human_sessions (agent_id, lead_id, session_type, started_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `, [agent_id, tr.lead_id, tr.request_type === 'call_transfer' ? 'call' : 'whatsapp']);

    // Pause AI agent
    if (tr.conversation_id) {
      await pool.query(`
        UPDATE conversations
        SET ai_summary = COALESCE(ai_summary || E'\n', '') || $1
        WHERE id = $2
      `, [`[HUMAN_TAKEOVER] Human agent ${agent_id} took over at ${new Date().toISOString()}`, tr.conversation_id]);
    }

    logRequest('PATCH', `/api/takeover/${id}/accept`, 200);
    sendSuccess(res, { message: 'Takeover accepted, AI paused' });
  } catch (error) {
    logRequest('PATCH', `/api/takeover/${id}/accept`, 500);
    handleError(res, error);
  }
};

/**
 * Complete takeover
 */
exports.completeTakeover = async (req, res) => {
  try {
    const { id } = req.params;
    const { outcome, notes, resume_ai } = req.body;

    const takeover = await pool.query('SELECT * FROM takeover_requests WHERE id = $1', [id]);

    if (takeover.rows.length === 0) {
      return res.status(404).json({ error: 'Takeover request not found' });
    }

    const tr = takeover.rows[0];

    // Update takeover
    await pool.query(`
      UPDATE takeover_requests
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    // End human session
    await pool.query(`
      UPDATE human_sessions
      SET ended_at = CURRENT_TIMESTAMP,
          duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)),
          outcome = $1, notes = $2
      WHERE agent_id = $3 AND lead_id = $4 AND ended_at IS NULL
    `, [outcome, notes, tr.assigned_agent_id, tr.lead_id]);

    // Decrement agent's assigned count
    await pool.query(`
      UPDATE human_agents
      SET assigned_leads = GREATEST(assigned_leads - 1, 0), status = 'available'
      WHERE id = $1
    `, [tr.assigned_agent_id]);

    // Resume AI if requested
    if (resume_ai && tr.conversation_id) {
      await pool.query(`
        UPDATE conversations
        SET ai_summary = COALESCE(ai_summary || E'\n', '') || $1
        WHERE id = $2
      `, [`[AI_RESUMED] AI agent resumed at ${new Date().toISOString()}`, tr.conversation_id]);
    }

    logRequest('PATCH', `/api/takeover/${id}/complete`, 200);
    sendSuccess(res, { message: 'Takeover completed' });
  } catch (error) {
    logRequest('PATCH', `/api/takeover/${id}/complete`, 500);
    handleError(res, error);
  }
};

/**
 * Get all human agents
 */
exports.getAllHumanAgents = async (req, res) => {
  try {
    const { status, role } = req.query;

    let query = 'SELECT * FROM human_agents WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    if (role) {
      params.push(role);
      query += ` AND role = $${params.length}`;
    }

    query += ' ORDER BY assigned_leads ASC;';
    const result = await pool.query(query, params);

    logRequest('GET', '/api/human-agents', 200);
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/human-agents', 500);
    handleError(res, error);
  }
};

/**
 * Update agent status
 */
exports.updateAgentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['available', 'busy', 'offline'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await pool.query(`
      UPDATE human_agents
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [status, id]);

    logRequest('PATCH', `/api/human-agents/${id}/status`, 200);
    sendSuccess(res, { message: 'Status updated' });
  } catch (error) {
    logRequest('PATCH', `/api/human-agents/${id}/status`, 500);
    handleError(res, error);
  }
};