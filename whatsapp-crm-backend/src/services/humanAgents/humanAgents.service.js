
const logger = require('../../utils/logger');

class HumanAgentsService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get agent profile with performance metrics
   */
  async getAgentProfile(agentId) {
    try {
      const query = `
        WITH agent_stats AS (
          SELECT 
            COUNT(DISTINCT l.id) as total_leads,
            COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'qualified') as qualified_leads,
            COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'converted') as converted_leads,
            AVG(l.interest_level) as avg_interest_level
          FROM leads l
          WHERE l.assigned_to_agent = (SELECT email FROM human_agents WHERE id = $1)
        ),
        session_stats AS (
          SELECT 
            COUNT(*) as total_sessions,
            AVG(duration_seconds) as avg_session_duration,
            COUNT(*) FILTER (WHERE outcome = 'converted') as successful_sessions
          FROM human_sessions
          WHERE agent_id = $1
        ),
        task_stats AS (
          SELECT 
            COUNT(*) as total_tasks,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
            COUNT(*) FILTER (WHERE status = 'completed' AND completed_at <= due_date) as on_time_tasks
          FROM tasks
          WHERE assigned_to_agent_id = $1
        )
        SELECT 
          ha.*,
          ast.*,
          sst.*,
          tst.*,
          ROUND((ast.converted_leads::numeric / NULLIF(ast.total_leads, 0) * 100), 2) as conversion_rate,
          ROUND((tst.on_time_tasks::numeric / NULLIF(tst.completed_tasks, 0) * 100), 2) as task_completion_rate
        FROM human_agents ha
        CROSS JOIN agent_stats ast
        CROSS JOIN session_stats sst
        CROSS JOIN task_stats tst
        WHERE ha.id = $1
      `;

      const result = await this.pool.query(query, [agentId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error in getAgentProfile:', error);
      throw error;
    }
  }

  /**
   * Get agent performance history
   */
  async getAgentPerformanceHistory(agentId, days = 30) {
    try {
      const query = `
        WITH daily_performance AS (
          SELECT 
            DATE(hs.started_at) as date,
            COUNT(DISTINCT hs.lead_id) as leads_handled,
            COUNT(*) as sessions,
            SUM(hs.duration_seconds) as total_time,
            COUNT(*) FILTER (WHERE hs.outcome = 'converted') as conversions,
            AVG(
              CASE 
                WHEN cl.sentiment->>'tone_score' IS NOT NULL 
                THEN (cl.sentiment->>'tone_score')::numeric 
                ELSE NULL 
              END
            ) as avg_sentiment_score
          FROM human_sessions hs
          LEFT JOIN call_logs cl ON hs.lead_id = cl.lead_id 
            AND DATE(cl.created_at) = DATE(hs.started_at)
          WHERE hs.agent_id = $1
          AND hs.started_at >= NOW() - INTERVAL '${days} days'
          GROUP BY DATE(hs.started_at)
          ORDER BY date
        )
        SELECT 
          date,
          leads_handled,
          sessions,
          ROUND(total_time / 3600.0, 2) as hours_worked,
          conversions,
          ROUND((conversions::numeric / NULLIF(leads_handled, 0) * 100), 2) as daily_conversion_rate,
          ROUND(avg_sentiment_score, 2) as avg_sentiment
        FROM daily_performance
      `;

      const result = await this.pool.query(query, [agentId]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getAgentPerformanceHistory:', error);
      throw error;
    }
  }

  /**
   * Get agent leaderboard
   */
  async getAgentLeaderboard(companyId, metric = 'conversions', period = 'month') {
    try {
      const periodFilter = {
        'week': 'NOW() - INTERVAL \'7 days\'',
        'month': 'NOW() - INTERVAL \'30 days\'',
        'quarter': 'NOW() - INTERVAL \'90 days\'',
        'year': 'NOW() - INTERVAL \'365 days\''
      }[period] || 'NOW() - INTERVAL \'30 days\'';

      const query = `
        WITH agent_metrics AS (
          SELECT 
            ha.id,
            ha.name,
            ha.email,
            ha.role,
            COUNT(DISTINCT l.id) as total_leads,
            COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'qualified') as qualified_leads,
            COUNT(DISTINCT l.id) FILTER (WHERE l.lead_status = 'converted') as converted_leads,
            COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) as revenue_generated,
            COUNT(DISTINCT hs.id) as sessions,
            COALESCE(SUM(hs.duration_seconds), 0) as total_time,
            COUNT(DISTINCT t.id) as tasks_assigned,
            COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as tasks_completed,
            AVG(
              CASE 
                WHEN cl.sentiment->>'tone_score' IS NOT NULL 
                THEN (cl.sentiment->>'tone_score')::numeric 
                ELSE NULL 
              END
            ) as avg_sentiment_score
          FROM human_agents ha
          LEFT JOIN leads l ON l.assigned_to_agent = ha.email 
            AND l.updated_at >= ${periodFilter}
          LEFT JOIN invoices i ON i.lead_id = l.id 
            AND i.paid_date >= ${periodFilter}
          LEFT JOIN human_sessions hs ON hs.agent_id = ha.id 
            AND hs.started_at >= ${periodFilter}
          LEFT JOIN tasks t ON t.assigned_to_agent_id = ha.id 
            AND t.created_at >= ${periodFilter}
          LEFT JOIN call_logs cl ON cl.lead_id = l.id 
            AND cl.created_at >= ${periodFilter}
          WHERE ha.status = 'active'
          AND EXISTS (
            SELECT 1 FROM agent_instances ai 
            WHERE ai.company_id = $1
          )
          GROUP BY ha.id, ha.name, ha.email, ha.role
        )
        SELECT 
          *,
          ROUND((converted_leads::numeric / NULLIF(total_leads, 0) * 100), 2) as conversion_rate,
          ROUND((tasks_completed::numeric / NULLIF(tasks_assigned, 0) * 100), 2) as task_completion_rate,
          ROUND(total_time / 3600.0, 2) as hours_worked,
          ROUND(avg_sentiment_score, 2) as avg_sentiment,
          RANK() OVER (
            ORDER BY 
              CASE 
                WHEN $2 = 'conversions' THEN converted_leads
                WHEN $2 = 'revenue' THEN revenue_generated::integer
                WHEN $2 = 'quality' THEN avg_sentiment_score::integer
                ELSE converted_leads
              END DESC
          ) as rank
        FROM agent_metrics
        ORDER BY rank
      `;

      const result = await this.pool.query(query, [companyId, metric]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getAgentLeaderboard:', error);
      throw error;
    }
  }

  /**
   * Create shift schedule
   */
  async createShiftSchedule(agentId, shifts) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const scheduleIds = [];
      for (const shift of shifts) {
        const result = await client.query(
          `INSERT INTO agent_shifts 
           (agent_id, shift_date, start_time, end_time, shift_type, status)
           VALUES ($1, $2, $3, $4, $5, 'scheduled')
           RETURNING id`,
          [agentId, shift.date, shift.start_time, shift.end_time, shift.type]
        );
        scheduleIds.push(result.rows[0].id);
      }

      await client.query('COMMIT');
      return { success: true, schedule_ids: scheduleIds };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in createShiftSchedule:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get agent schedule
   */
  async getAgentSchedule(agentId, startDate, endDate) {
    try {
      const query = `
        SELECT 
          ash.*,
          COUNT(t.id) as scheduled_tasks,
          COUNT(hs.id) as scheduled_sessions
        FROM agent_shifts ash
        LEFT JOIN tasks t ON t.assigned_to_agent_id = ash.agent_id
          AND DATE(t.due_date) = ash.shift_date
          AND t.status NOT IN ('completed', 'cancelled')
        LEFT JOIN human_sessions hs ON hs.agent_id = ash.agent_id
          AND DATE(hs.started_at) = ash.shift_date
        WHERE ash.agent_id = $1
        AND ash.shift_date BETWEEN $2 AND $3
        GROUP BY ash.id
        ORDER BY ash.shift_date, ash.start_time
      `;

      const result = await this.pool.query(query, [agentId, startDate, endDate]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getAgentSchedule:', error);
      throw error;
    }
  }

  /**
   * Request time off
   */
  async requestTimeOff(agentId, startDate, endDate, reason) {
    try {
      const query = `
        INSERT INTO time_off_requests 
        (agent_id, start_date, end_date, reason, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING id
      `;

      const result = await this.pool.query(query, [agentId, startDate, endDate, reason]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error in requestTimeOff:', error);
      throw error;
    }
  }

  /**
   * Review time off request
   */
  async reviewTimeOffRequest(requestId, action, reviewerId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE time_off_requests 
         SET status = $1, reviewed_by = $2, reviewed_at = NOW()
         WHERE id = $3`,
        [action, reviewerId, requestId]
      );

      if (action === 'approved') {
        const request = await client.query(
          'SELECT agent_id, start_date, end_date FROM time_off_requests WHERE id = $1',
          [requestId]
        );

        const { agent_id, start_date, end_date } = request.rows[0];

        await client.query(
          `UPDATE agent_shifts 
           SET status = 'cancelled', notes = 'Time off approved'
           WHERE agent_id = $1 
           AND shift_date BETWEEN $2 AND $3`,
          [agent_id, start_date, end_date]
        );
      }

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in reviewTimeOffRequest:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Start break
   */
  async startBreak(agentId, breakType = 'regular') {
    try {
      const query = `
        INSERT INTO agent_breaks (agent_id, break_type, started_at, status)
        VALUES ($1, $2, NOW(), 'active')
        RETURNING id
      `;

      const result = await this.pool.query(query, [agentId, breakType]);

      await this.pool.query(
        `UPDATE human_agents SET status = 'on_break' WHERE id = $1`,
        [agentId]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Error in startBreak:', error);
      throw error;
    }
  }

  /**
   * End break
   */
  async endBreak(breakId, agentId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE agent_breaks 
         SET ended_at = NOW(),
             duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at)),
             status = 'completed'
         WHERE id = $1 AND agent_id = $2`,
        [breakId, agentId]
      );

      await client.query(
        `UPDATE human_agents SET status = 'available' WHERE id = $1`,
        [agentId]
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in endBreak:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get break history
   */
  async getBreakHistory(agentId, startDate, endDate) {
    try {
      const query = `
        SELECT 
          DATE(started_at) as date,
          break_type,
          COUNT(*) as break_count,
          SUM(duration_seconds) as total_break_time,
          AVG(duration_seconds) as avg_break_duration
        FROM agent_breaks
        WHERE agent_id = $1
        AND started_at BETWEEN $2 AND $3
        AND status = 'completed'
        GROUP BY DATE(started_at), break_type
        ORDER BY date DESC
      `;

      const result = await this.pool.query(query, [agentId, startDate, endDate]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getBreakHistory:', error);
      throw error;
    }
  }

  /**
   * Get agent status dashboard
   */
  async getAgentStatusDashboard(companyId) {
    try {
      const query = `
        WITH current_status AS (
          SELECT 
            ha.id, ha.name, ha.email, ha.status, ha.assigned_leads, ha.max_concurrent_leads,
            ash.shift_date, ash.start_time, ash.end_time,
            ab.break_type, ab.started_at as break_started,
            hs.lead_id as current_lead_id, l.name as current_lead_name,
            hs.session_type, hs.started_at as session_started,
            (SELECT COUNT(DISTINCT hs2.lead_id) FROM human_sessions hs2
             WHERE hs2.agent_id = ha.id AND DATE(hs2.started_at) = CURRENT_DATE) as leads_today,
            (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to_agent_id = ha.id
             AND t.status = 'pending' AND t.due_date <= CURRENT_DATE) as pending_tasks
          FROM human_agents ha
          LEFT JOIN agent_shifts ash ON ash.agent_id = ha.id AND ash.shift_date = CURRENT_DATE AND ash.status = 'active'
          LEFT JOIN agent_breaks ab ON ab.agent_id = ha.id AND ab.status = 'active'
          LEFT JOIN human_sessions hs ON hs.agent_id = ha.id AND hs.ended_at IS NULL
          LEFT JOIN leads l ON hs.lead_id = l.id
          WHERE ha.status != 'inactive'
          AND EXISTS (SELECT 1 FROM agent_instances ai JOIN companies c ON ai.company_id = c.id WHERE c.id = $1)
        )
        SELECT *, 
          CASE 
            WHEN status = 'available' AND assigned_leads < max_concurrent_leads THEN 'ready'
            WHEN status = 'available' AND assigned_leads >= max_concurrent_leads THEN 'at_capacity'
            WHEN status = 'busy' THEN 'in_session'
            WHEN status = 'on_break' THEN 'on_break'
            ELSE 'offline'
          END as availability_status,
          EXTRACT(EPOCH FROM (NOW() - break_started)) / 60 as break_duration_minutes,
          EXTRACT(EPOCH FROM (NOW() - session_started)) / 60 as session_duration_minutes
        FROM current_status
        ORDER BY CASE status WHEN 'available' THEN 1 WHEN 'busy' THEN 2 WHEN 'on_break' THEN 3 ELSE 4 END, name
      `;

      const result = await this.pool.query(query, [companyId]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getAgentStatusDashboard:', error);
      throw error;
    }
  }

  /**
   * Send team message
   */
  async sendTeamMessage(companyId, senderId, leadId, message, mentions = []) {
    try {
      const query = `
        INSERT INTO team_chat_messages 
        (company_id, sender_agent_id, lead_id, message_text, mentions)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at
      `;

      const result = await this.pool.query(query, [
        companyId, senderId, leadId, message, JSON.stringify(mentions)
      ]);

      if (mentions.length > 0) {
        for (const mentionedAgentId of mentions) {
          await this.pool.query(
            `INSERT INTO push_notifications 
             (agent_id, notification_type, title, body, data)
             VALUES ($1, 'mention', 'You were mentioned', $2, $3)`,
            [mentionedAgentId, `${message.substring(0, 100)}...`, 
             JSON.stringify({ message_id: result.rows[0].id, lead_id: leadId })]
          );
        }
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error in sendTeamMessage:', error);
      throw error;
    }
  }

  /**
   * Get team chat history
   */
  async getTeamChatHistory(leadId, limit = 50, offset = 0) {
    try {
      const query = `
        SELECT tcm.*, ha.name as sender_name, ha.email as sender_email,
          (SELECT json_agg(json_build_object('id', ha2.id, 'name', ha2.name))
           FROM human_agents ha2 WHERE ha2.id = ANY(
             SELECT jsonb_array_elements_text(tcm.mentions)::integer
           )) as mentioned_agents
        FROM team_chat_messages tcm
        JOIN human_agents ha ON tcm.sender_agent_id = ha.id
        WHERE tcm.lead_id = $1
        ORDER BY tcm.created_at DESC LIMIT $2 OFFSET $3
      `;

      const result = await this.pool.query(query, [leadId, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getTeamChatHistory:', error);
      throw error;
    }
  }

  /**
   * Create shared note
   */
  async createSharedNote(companyId, leadId, agentId, title, content, tags = []) {
    try {
      const query = `
        INSERT INTO shared_notes 
        (company_id, lead_id, created_by_agent_id, note_title, note_content, tags)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at
      `;

      const result = await this.pool.query(query, [
        companyId, leadId, agentId, title, content, tags
      ]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error in createSharedNote:', error);
      throw error;
    }
  }

  /**
   * Get shared notes
   */
  async getSharedNotes(leadId) {
    try {
      const query = `
        SELECT sn.*, ha_created.name as created_by_name, ha_edited.name as last_edited_by_name
        FROM shared_notes sn
        JOIN human_agents ha_created ON sn.created_by_agent_id = ha_created.id
        LEFT JOIN human_agents ha_edited ON sn.last_edited_by = ha_edited.id
        WHERE sn.lead_id = $1
        ORDER BY sn.is_pinned DESC, sn.created_at DESC
      `;

      const result = await this.pool.query(query, [leadId]);
      return result.rows;
    } catch (error) {
      logger.error('Error in getSharedNotes:', error);
      throw error;
    }
  }

  /**
   * Get agent workload
   */
  async getAgentWorkload(agentId) {
    try {
      const query = `
        SELECT 
          COUNT(DISTINCT l.id) as active_leads,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pending') as pending_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.due_date = CURRENT_DATE) as tasks_due_today,
          COUNT(DISTINCT hs.id) FILTER (WHERE hs.ended_at IS NULL) as active_sessions,
          ha.max_concurrent_leads,
          ha.max_concurrent_leads - COUNT(DISTINCT l.id) as capacity_remaining
        FROM human_agents ha
        LEFT JOIN leads l ON l.assigned_to_agent = ha.email AND l.lead_status NOT IN ('converted', 'lost')
        LEFT JOIN tasks t ON t.assigned_to_agent_id = ha.id
        LEFT JOIN human_sessions hs ON hs.agent_id = ha.id
        WHERE ha.id = $1
        GROUP BY ha.id, ha.max_concurrent_leads
      `;

      const result = await this.pool.query(query, [agentId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error in getAgentWorkload:', error);
      throw error;
    }
  }

  /**
   * Balance workload
   */
  async balanceWorkload(companyId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const agents = await client.query(
        `SELECT ha.id, ha.email, ha.max_concurrent_leads, COUNT(DISTINCT l.id) as current_leads
         FROM human_agents ha
         LEFT JOIN leads l ON l.assigned_to_agent = ha.email
         WHERE ha.status = 'available' AND EXISTS (SELECT 1 FROM agent_instances ai WHERE ai.company_id = $1)
         GROUP BY ha.id, ha.email, ha.max_concurrent_leads
         HAVING COUNT(DISTINCT l.id) < ha.max_concurrent_leads
         ORDER BY current_leads ASC`,
        [companyId]
      );

      const unassignedLeads = await client.query(
        `SELECT id FROM leads 
         WHERE company_id = $1 AND (assigned_to_agent IS NULL OR assigned_to_agent = '')
         AND lead_status = 'new' ORDER BY created_at ASC LIMIT 100`,
        [companyId]
      );

      let assignedCount = 0;
      for (const lead of unassignedLeads.rows) {
        const agent = agents.rows[assignedCount % agents.rows.length];
        
        await client.query(
          `UPDATE leads SET assigned_to_agent = $1, updated_at = NOW() WHERE id = $2`,
          [agent.email, lead.id]
        );

        await client.query(
          `UPDATE human_agents SET assigned_leads = assigned_leads + 1 WHERE id = $1`,
          [agent.id]
        );

        assignedCount++;
      }

      await client.query('COMMIT');
      return { success: true, assigned_count: assignedCount };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in balanceWorkload:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = HumanAgentsService;