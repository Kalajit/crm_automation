require('dotenv').config();
const app = require('./app');
const { initializeWebSocket } = require('./websocket/callUpdates');
const http = require('http');

const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket
initializeWebSocket(server);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✓ HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('⚠️ SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✓ HTTP server closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ WebSocket endpoint: ws://localhost:${PORT}/ws/live-call/:call_sid`);
});

module.exports = server;