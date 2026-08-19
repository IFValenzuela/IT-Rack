'use strict';
/**
 * One-time setup script: creates the database and imports backup.sql
 * Usage: node setup-db.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 3307);
const DB_USER = process.env.DB_USER || 'ian';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'inventory_db';

(async () => {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    port: DB_PORT,
    multipleStatements: true,
  });

  console.log(`Connected to MariaDB at ${DB_HOST}:${DB_PORT} as ${DB_USER}.`);

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  console.log(`Database "${DB_NAME}" ready.`);

  await conn.query(`USE \`${DB_NAME}\``);

  const sqlFile = path.join(__dirname, 'backup.sql');
  const sqlBuf = fs.readFileSync(sqlFile);
  let sql;
  if (sqlBuf[0] === 0xFF && sqlBuf[1] === 0xFE) {
    sql = sqlBuf.toString('utf16le').replace(/^\uFEFF/, '');
  } else {
    sql = sqlBuf.toString('utf8').replace(/^\uFEFF/, '');
  }

  console.log('Importing backup.sql ...');
  await conn.query(sql);
  console.log('Import complete!');

  const [tables] = await conn.query('SHOW TABLES');
  console.log(`\nTables in ${DB_NAME}:`);
  tables.forEach(row => console.log('  -', Object.values(row)[0]));

  await conn.end();
  console.log('\nDone! You can now run: npm start');
})().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
