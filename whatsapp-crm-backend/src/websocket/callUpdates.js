const WebSocket = require('ws');
const pool = require('../config/database');
const { logInfo, logError } = require('../utils/logger');

// Track active WebSocket connections per call_sid
const activeConnections = new Map();

/**
 * Initialize WebSocket server
 * @param {object} server - HTTP server instance
 */
function initializeWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws, req) => {
    handleConnection(ws, req);
  });
  
  logInfo('WebSocket server initialized');
  
  return wss;
}

/**
 * Handle new WebSocket connection
 * @param {WebSocket} ws - WebSocket instance
 * @param {object} req - HTTP request object
 */
function handleConnection(ws, req) {
  // Extract call_sid from URL: /ws/live-call/:call_sid
  const urlParts = req.url.split('/');
  const call_sid = urlParts[urlParts.length - 1];
  
  if (!call_sid || call_sid.length < 10) {
    ws.send(JSON.stringify({ error: 'Invalid call_sid' }));
    ws.close();
    return;
  }
  
  // Register connection
  if (!activeConnections.has(call_sid)) {
    activeConnections.set(call_sid, new Set());
  }
  activeConnections.get(call_sid).add(ws);
  
  logInfo(`Client connected to call ${call_sid} (${activeConnections.get(call_sid).size} active)`);
  
  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    call_sid: call_sid,
    timestamp: new Date().toISOString()
  }));
  
  // Handle incoming messages from client
  ws.on('message', async (message) => {
    try {
      await handleMessage(ws, call_sid, message);
    } catch (error) {
      logError('Error handling WebSocket message:', error);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    handleDisconnection(call_sid, ws);
  });
  
  ws.on('error', (error) => {
    logError(`WebSocket error on call ${call_sid}:`, error);
    ws.close();
  });
}

/**
 * Handle incoming WebSocket message
 * @param {WebSocket} ws - WebSocket instance
 * @param {string} call_sid - Call SID
 * @param {string} message - Message data
 */
async function handleMessage(ws, call_sid, message) {
  const data = JSON.parse(message);
  
  if (data.type === 'agent_note') {
    // Store agent note in database
    await pool.query(`
      UPDATE call_logs
      SET summary = jsonb_set(
        COALESCE(summary, '{}'::jsonb),
        '{agent_notes}',
        to_jsonb($1::text)
      )
      WHERE call_sid = $2
    `, [data.note, call_sid]);
    
    // Broadcast to all other clients on this call
    broadcastToCall(call_sid, {
      type: 'agent_note',
      note: data.note,
      timestamp: new Date().toISOString()
    }, ws);
  }
}

/**
 * Handle WebSocket disconnection
 * @param {string} call_sid - Call SID
 * @param {WebSocket} ws - WebSocket instance
 */
function handleDisconnection(call_sid, ws) {
  if (activeConnections.has(call_sid)) {
    activeConnections.get(call_sid).delete(ws);
    
    if (activeConnections.get(call_sid).size === 0) {
      activeConnections.delete(call_sid);
      logInfo(`All clients disconnected from call ${call_sid}, cleanup complete`);
    } else {
      logInfo(`Client disconnected from call ${call_sid} (${activeConnections.get(call_sid).size} remaining)`);
    }
  }
}

/**
 * Broadcast message to all clients watching a call
 * @param {string} call_sid - Call SID
 * @param {object} data - Data to broadcast
 * @param {WebSocket} excludeWs - WebSocket to exclude from broadcast
 */
function broadcastToCall(call_sid, data, excludeWs = null) {
  if (!activeConnections.has(call_sid)) return;
  
  const message = JSON.stringify(data);
  let sentCount = 0;
  
  activeConnections.get(call_sid).forEach((client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(message);
      sentCount++;
    }
  });
  
  logInfo(`Broadcast to ${sentCount} clients on call ${call_sid}`);
}

/**
 * Get WebSocket statistics
 * @returns {object} - Statistics object
 */
function getWebSocketStats() {
  const stats = {};
  activeConnections.forEach((clients, call_sid) => {
    stats[call_sid] = clients.size;
  });
  
  return {
    total_calls: activeConnections.size,
    total_clients: Array.from(activeConnections.values()).reduce((sum, set) => sum + set.size, 0),
    calls: stats
  };
}

module.exports = {
  initializeWebSocket,
  broadcastToCall,
  getWebSocketStats,
  activeConnections
};