const { Pool } = require('pg');
require('dotenv').config();


const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
  console.log(`✓ Database connected: ${process.env.DB_NAME}`);
});

process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM received, closing database pool...');
  await pool.end();
});

module.exports = pool;