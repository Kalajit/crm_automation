const Redis = require('ioredis');
const { logger } = require('../utils/logger');

// const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
//   retryStrategy: (times) => {
//     const delay = Math.min(times * 50, 2000);
//     return delay;
//   },
//   maxRetriesPerRequest: 3
// });

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => {
    if (times > 10) {
      logger.error('Redis max retries reached, giving up');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 100, 3000);
    logger.info(`Retrying Redis connection, attempt ${times}, delay ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  // Additional connection options
  connectTimeout: 10000,
  reconnectOnError: (err) => {
    logger.warn('Redis reconnect on error:', err.message);
    return true;
  }
});

redis.on('connect', () => {
  console.log('✓ Redis connected');
});

redis.on('ready', () => {
  logger.info('✓ Redis connected and ready');
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('close', () => {
  console.log('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

redis.on('end', () => {
  logger.warn('Redis connection ended');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing Redis connection');
  await redis.quit();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing Redis connection');
  await redis.quit();
});

module.exports = redis;