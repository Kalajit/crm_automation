const { getWebSocketStats } = require('../websocket/callUpdates');
const { sendSuccess } = require('../utils/response');

/**
 * Get WebSocket statistics
 */
exports.getStats = (req, res) => {
  const stats = getWebSocketStats();
  sendSuccess(res, {
    ...stats
  });
};