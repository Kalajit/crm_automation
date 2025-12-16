const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');

// Create task
exports.createTask = async (req, res) => {
  try {
    const {
      company_id,
      lead_id,
      assigned_to_agent_id,
      task_type,
      title,
      description,
      due_date,
      priority = 'medium',
      reminder_before_minutes = 30
    } = req.body;
    
    if (!company_id || !lead_id || !task_type || !title) {
      return errorResponse(res, 'company_id, lead_id, task_type, and title required', 400);
    }
    
    const query = `
      INSERT INTO tasks (
        company_id, lead_id, assigned_to_agent_id,
        task_type, title, description, due_date,
        priority, reminder_before_minutes, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      company_id,
      lead_id,
      assigned_to_agent_id || null,
      task_type,
      title,
      description || null,
      due_date || null,
      priority,
      reminder_before_minutes
    ]);
    
    // Auto-assign if no agent specified
    if (!assigned_to_agent_id && lead_id) {
      const leadAgent = await pool.query(
        'SELECT assigned_to_agent FROM leads WHERE id = $1',
        [lead_id]
      );
      
      if (leadAgent.rows[0]?.assigned_to_agent) {
        const agentResult = await pool.query(
          'SELECT id FROM human_agents WHERE name = $1',
          [leadAgent.rows[0].assigned_to_agent]
        );
        
        if (agentResult.rows.length > 0) {
          await pool.query(
            'UPDATE tasks SET assigned_to_agent_id = $1 WHERE id = $2',
            [agentResult.rows[0].id, result.rows[0].id]
          );
        }
      }
    }
    
    // Send notification to assigned agent
    if (assigned_to_agent_id) {
      await pool.query(`
        INSERT INTO system_notifications (
          notification_type, title, message, priority
        )
        VALUES ('task_assigned', $1, $2, $3)
      `, [
        `New Task: ${title}`,
        `You have been assigned a ${task_type} task for Lead #${lead_id}`,
        priority
      ]);
    }
    
    logger.info('POST', '/api/tasks', 201);
    return successResponse(res, result.rows[0], 'Task created successfully', 201);
    
  } catch (error) {
    logger.error('Create task error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get tasks for agent
exports.getTasksForAgent = async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status, priority, limit = 50 } = req.query;
    
    let query = `
      SELECT 
        t.*,
        l.name as lead_name,
        l.phone_number,
        l.email,
        l.company_id
      FROM tasks t
      JOIN leads l ON t.lead_id = l.id
      WHERE t.assigned_to_agent_id = $1
    `;
    
    const params = [agent_id];
    
    if (status) {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }
    
    if (priority) {
      params.push(priority);
      query += ` AND t.priority = $${params.length}`;
    }
    
    query += ` ORDER BY 
      CASE t.priority 
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC
    `;
    
    params.push(parseInt(limit));
    query += ` LIMIT $${params.length}`;
    
    const result = await pool.query(query, params);
    
    logger.info('GET', `/api/tasks/agent/${agent_id}`, 200);
    return successResponse(res, result.rows, 'Tasks retrieved successfully');
    
  } catch (error) {
    logger.error('Get agent tasks error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get tasks for lead
exports.getTasksForLead = async (req, res) => {
  try {
    const { lead_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        t.*,
        ha.name as assigned_agent_name,
        ha.email as agent_email
      FROM tasks t
      LEFT JOIN human_agents ha ON t.assigned_to_agent_id = ha.id
      WHERE t.lead_id = $1
      ORDER BY t.created_at DESC
    `, [lead_id]);
    
    logger.info('GET', `/api/tasks/lead/${lead_id}`, 200);
    return successResponse(res, result.rows, 'Tasks retrieved successfully');
    
  } catch (error) {
    logger.error('Get lead tasks error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Update task
exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      assigned_to_agent_id,
      due_date,
      priority,
      notes
    } = req.body;
    
    const updates = [];
    const params = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(status);
      
      if (status === 'completed') {
        paramCount++;
        updates.push(`completed_at = $${paramCount}`);
        params.push(new Date().toISOString());
      }
    }
    
    if (assigned_to_agent_id !== undefined) {
      paramCount++;
      updates.push(`assigned_to_agent_id = $${paramCount}`);
      params.push(assigned_to_agent_id);
    }
    
    if (due_date) {
      paramCount++;
      updates.push(`due_date = $${paramCount}`);
      params.push(due_date);
    }
    
    if (priority) {
      paramCount++;
      updates.push(`priority = $${paramCount}`);
      params.push(priority);
    }
    
    if (notes) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      params.push(notes);
    }
    
    if (updates.length === 0) {
      return errorResponse(res, 'No fields to update', 400);
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(id);
    
    const query = `
      UPDATE tasks
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'Task not found', 404);
    }
    
    logger.info('PATCH', `/api/tasks/${id}`, 200);
    return successResponse(res, result.rows[0], 'Task updated successfully');
    
  } catch (error) {
    logger.error('Update task error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Delete task
exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'Task not found', 404);
    }
    
    logger.info('DELETE', `/api/tasks/${id}`, 200);
    return successResponse(res, result.rows[0], 'Task deleted successfully');
    
  } catch (error) {
    logger.error('Delete task error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get overdue tasks
exports.getOverdueTasks = async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        t.*,
        l.name as lead_name,
        l.phone_number,
        ha.name as assigned_agent_name
      FROM tasks t
      JOIN leads l ON t.lead_id = l.id
      LEFT JOIN human_agents ha ON t.assigned_to_agent_id = ha.id
      WHERE t.company_id = $1
      AND t.status NOT IN ('completed', 'cancelled')
      AND t.due_date < NOW()
      ORDER BY t.due_date ASC
    `, [company_id]);
    
    logger.info('GET', `/api/tasks/overdue/${company_id}`, 200);
    return successResponse(res, result.rows, 'Overdue tasks retrieved successfully');
    
  } catch (error) {
    logger.error('Get overdue tasks error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Helper function: Auto-create tasks from routing rules
exports.autoCreateTask = async (lead_id, company_id, task_config) => {
  try {
    await pool.query(`
      INSERT INTO tasks (
        company_id, lead_id, task_type, title,
        description, due_date, priority, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
    `, [
      company_id,
      lead_id,
      task_config.type || 'follow_up',
      task_config.title,
      task_config.description || null,
      task_config.due_date || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      task_config.priority || 'medium'
    ]);
    
    logger.info(`✅ Auto-created task for lead ${lead_id}`);
  } catch (error) {
    logger.error('Auto-create task error:', error);
  }
};