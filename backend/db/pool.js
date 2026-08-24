'use strict';
const fs = require('fs');
const mysql = require('mysql2/promise');

/**
 * Shared connection pool — imported by all route modules.
 * dotenv is loaded by server.js before any routes are required,
 * so process.env is already populated when this module runs.
 */
const config = {
  host:     process.env.DB_HOST || 'localhost',
  user:     process.env.DB_USER || 'ian',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inventory_db',
  port:     Number(process.env.DB_PORT || 3307),
};

if (process.env.DB_SOCKET && fs.existsSync(process.env.DB_SOCKET)) {
  config.socketPath = process.env.DB_SOCKET;
  config.host = 'localhost';
}

const pool = mysql.createPool(config);

module.exports = pool;
