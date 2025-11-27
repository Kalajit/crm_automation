const pool = require('../config/database');
const { sendSuccess } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Detailed health check endpoint
 */
exports.healthCheck = async (req, res) => {
  try {
    // Check database connection
    const dbCheck = await pool.query('SELECT NOW()');
    
    // Check active connections
    const activeConns = await pool.query(`
      SELECT count(*) as active 
      FROM pg_stat_activity 
      WHERE datname = $1 AND state = 'active';
    `, [process.env.DB_NAME]);
    
    logRequest('GET', '/api/health', 200);
    sendSuccess(res, {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        timestamp: dbCheck.rows[0].now,
        active_connections: parseInt(activeConns.rows[0].active)
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    logRequest('GET', '/api/health', 500);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
};