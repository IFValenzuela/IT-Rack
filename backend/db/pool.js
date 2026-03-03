'use strict';
const mysql = require('mysql2/promise');

/**
 * Shared connection pool — imported by all route modules.
 * dotenv is loaded by server.js before any routes are required,
 * so process.env is already populated when this module runs.
 */
const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     Number(process.env.DB_PORT || 3306),
});

module.exports = pool;
