const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');
const { autoCreateTask } = require('./tasks.controller');

// Create routing rule
exports.createRoutingRule = async (req, res) => {
  try {
    const {
      company_id,
      rule_name,
      rule_type,
      conditions,
      action,
      target_agent_id,
      priority,
      is_active = true
    } = req.body;
    
    if (!company_id || !rule_name || !rule_type || !conditions || !action) {
      return errorResponse(res, 'company_id, rule_name, rule_type, conditions, and action required', 400);
    }
    
    const query = `
      INSERT INTO routing_rules (
        company_id, rule_name, rule_type, conditions,
        action, target_agent_id, priority, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      company_id,
      rule_name,
      rule_type,
      JSON.stringify(conditions),
      action,
      target_agent_id || null,
      priority || 50,
      is_active
    ]);
    
    logger.info('POST', '/api/routing/rules', 201);
    return successResponse(res, result.rows[0], 'Routing rule created successfully', 201);
    
  } catch (error) {
    logger.error('Create routing rule error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get routing rules for company
exports.getRoutingRules = async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        rr.*,
        ha.name as assigned_agent_name
      FROM routing_rules rr
      LEFT JOIN human_agents ha ON rr.target_agent_id = ha.id
      WHERE rr.company_id = $1
      ORDER BY rr.priority DESC, rr.created_at DESC
    `, [company_id]);
    
    logger.info('GET', `/api/routing/rules/${company_id}`, 200);
    return successResponse(res, result.rows, 'Routing rules retrieved successfully');
    
  } catch (error) {
    logger.error('Get routing rules error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Update routing rule
exports.updateRoutingRule = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      rule_name,
      conditions,
      action,
      target_agent_id,
      priority,
      is_active
    } = req.body;
    
    const updates = [];
    const params = [];
    let paramCount = 0;
    
    if (rule_name) {
      paramCount++;
      updates.push(`rule_name = $${paramCount}`);
      params.push(rule_name);
    }
    
    if (conditions) {
      paramCount++;
      updates.push(`conditions = $${paramCount}`);
      params.push(JSON.stringify(conditions));
    }
    
    if (action) {
      paramCount++;
      updates.push(`action = $${paramCount}`);
      params.push(action);
    }
    
    if (target_agent_id !== undefined) {
      paramCount++;
      updates.push(`target_agent_id = $${paramCount}`);
      params.push(target_agent_id);
    }
    
    if (priority !== undefined) {
      paramCount++;
      updates.push(`priority = $${paramCount}`);
      params.push(priority);
    }
    
    if (is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      params.push(is_active);
    }
    
    if (updates.length === 0) {
      return errorResponse(res, 'No fields to update', 400);
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(id);
    
    const query = `
      UPDATE routing_rules
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'Routing rule not found', 404);
    }
    
    logger.info('PATCH', `/api/routing/rules/${id}`, 200);
    return successResponse(res, result.rows[0], 'Routing rule updated successfully');
    
  } catch (error) {
    logger.error('Update routing rule error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Delete routing rule
exports.deleteRoutingRule = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM routing_rules WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'Routing rule not found', 404);
    }
    
    logger.info('DELETE', `/api/routing/rules/${id}`, 200);
    return successResponse(res, result.rows[0], 'Routing rule deleted successfully');
    
  } catch (error) {
    logger.error('Delete routing rule error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Apply routing rules to a lead
exports.applyRoutingToLead = async (req, res) => {
  const { lead_id } = req.params;
  
  try {
    const { company_id } = req.body;
    
    if (!company_id) {
      return errorResponse(res, 'company_id required', 400);
    }
    
    const actions = await applyRoutingRules(lead_id, company_id);
    
    logger.info('POST', `/api/routing/leads/${lead_id}/apply`, 200);
    return successResponse(res, {
      lead_id: parseInt(lead_id),
      actions_applied: actions.length,
      actions
    }, 'Routing rules applied successfully');
    
  } catch (error) {
    logger.error('Apply routing error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Helper function: Apply routing rules logic
async function applyRoutingRules(lead_id, company_id) {
  try {
    const leadResult = await pool.query(`
      SELECT 
        l.*,
        (l.metadata->'lead_score'->>'score')::int as score,
        l.metadata->'lead_score'->>'grade' as grade
      FROM leads l
      WHERE l.id = $1 AND l.company_id = $2
    `, [lead_id, company_id]);
    
    if (leadResult.rows.length === 0) {
      throw new Error('Lead not found');
    }
    
    const lead = leadResult.rows[0];
    
    const rulesResult = await pool.query(`
      SELECT * FROM routing_rules
      WHERE company_id = $1 AND is_active = TRUE
      ORDER BY priority DESC, created_at ASC
    `, [company_id]);
    
    const appliedActions = [];
    
    for (const rule of rulesResult.rows) {
      const conditions = rule.conditions;
      let conditionMet = false;
      
      switch (rule.rule_type) {
        case 'score_based':
          if (conditions.min_score && lead.score >= conditions.min_score) {
            conditionMet = true;
          }
          if (conditions.grade && conditions.grade.includes(lead.grade)) {
            conditionMet = true;
          }
          break;
          
        case 'source_based':
          if (conditions.sources && conditions.sources.includes(lead.lead_source)) {
            conditionMet = true;
          }
          break;
          
        case 'language_based':
          if (conditions.languages && conditions.languages.includes(lead.preferred_language)) {
            conditionMet = true;
          }
          break;
          
        case 'time_based':
          const currentHour = new Date().getHours();
          if (conditions.hours) {
            conditionMet = currentHour >= conditions.hours.start && 
                          currentHour <= conditions.hours.end;
          }
          break;
          
        case 'custom':
          if (conditions.status && conditions.status.includes(lead.lead_status)) {
            conditionMet = true;
          }
          if (conditions.interest_level && lead.interest_level >= conditions.interest_level) {
            conditionMet = true;
          }
          break;
      }
      
      if (conditionMet) {
        let actionResult = null;
        
        switch (rule.action) {
          case 'assign_agent':
            if (rule.target_agent_id) {
              await pool.query(`
                UPDATE leads
                SET assigned_to_agent = (
                  SELECT name FROM human_agents WHERE id = $1
                )
                WHERE id = $2
              `, [rule.target_agent_id, lead_id]);
              
              actionResult = { type: 'assigned', agent_id: rule.target_agent_id };
            }
            break;
            
          case 'priority_queue':
            await pool.query(`
              UPDATE leads
              SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{priority}',
                '"high"'
              )
              WHERE id = $1
            `, [lead_id]);
            
            actionResult = { type: 'priority_set', priority: 'high' };
            break;
            
          case 'auto_call':
            await pool.query(`
              INSERT INTO scheduled_calls (
                company_id, lead_id, call_type, scheduled_time, status
              )
              VALUES ($1, $2, 'callback', NOW() + INTERVAL '5 minutes', 'pending')
            `, [company_id, lead_id]);
            
            actionResult = { type: 'call_scheduled', scheduled_in: '5 minutes' };
            break;
            
          case 'send_notification':
            const notificationMessage = conditions.notification_message || 
              `New lead ${lead.name || lead.phone_number} needs attention`;
            
            await pool.query(`
              INSERT INTO system_notifications (
                notification_type, title, message, priority
              )
              VALUES ('lead_routing', $1, $2, 'high')
            `, [`Lead #${lead_id} routed`, notificationMessage]);
            
            actionResult = { type: 'notification_sent' };
            break;
            
          case 'tag_lead':
            if (conditions.tags) {
              await pool.query(`
                UPDATE leads
                SET tags = array_cat(COALESCE(tags, ARRAY[]::text[]), $1)
                WHERE id = $2
              `, [conditions.tags, lead_id]);
              
              actionResult = { type: 'tags_added', tags: conditions.tags };
            }
            break;

            case 'create_task':
                if (conditions.task_config) {
                    await autoCreateTask(lead_id, company_id, conditions.task_config);
                    actionResult = { type: 'task_created', config: conditions.task_config };
                }
                break;
        }
        
        if (actionResult) {
          appliedActions.push({
            rule_id: rule.id,
            rule_name: rule.rule_name,
            ...actionResult
          });
          
          await pool.query(`
            INSERT INTO audit_logs (lead_id, action, details, created_by)
            VALUES ($1, 'routing_rule_applied', $2, 'system')
          `, [lead_id, JSON.stringify({
            rule_id: rule.id,
            rule_name: rule.rule_name,
            action: rule.action,
            result: actionResult
          })]);
        }
      }
    }
    
    return appliedActions;
    
  } catch (error) {
    logger.error('Apply routing rules error:', error);
    throw error;
  }
}