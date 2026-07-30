'use strict';
/**
 * One-time setup script: creates the database and imports backup.sql
 * Usage: node setup-db.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DB_NAME = 'it_rack_stock';

(async () => {
  // Connect WITHOUT selecting a database so we can CREATE it
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'FValenzuela34',
    port: 3306,
    multipleStatements: true,
  });

  console.log('Connected to MySQL.');

  // 1. Create database
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  console.log(`Database "${DB_NAME}" ready.`);

  // 2. Select it
  await conn.query(`USE \`${DB_NAME}\``);

  // 3. Read and execute backup.sql
  const sqlFile = path.join(__dirname, 'backup.sql');
  // Read as binary buffer then convert, to handle BOM / encoding
  const sqlBuf = fs.readFileSync(sqlFile);
  // Strip UTF-16 LE BOM if present, otherwise treat as UTF-8
  let sql;
  if (sqlBuf[0] === 0xFF && sqlBuf[1] === 0xFE) {
    sql = sqlBuf.toString('utf16le').replace(/^\uFEFF/, '');
  } else {
    sql = sqlBuf.toString('utf8').replace(/^\uFEFF/, '');
  }

  console.log('Importing backup.sql ...');
  await conn.query(sql);
  console.log('Import complete!');

  // 4. Quick verification
  const [tables] = await conn.query('SHOW TABLES');
  console.log(`\nTables in ${DB_NAME}:`);
  tables.forEach(row => console.log('  -', Object.values(row)[0]));

  await conn.end();
  console.log('\nDone! You can now run: npm start');
})().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
