'use strict';
const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

//  Health check 
const pool = require('./backend/db/pool');

app.get('/api/health', async (_req, res) => {
  try {
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    res.json({ ok: true, db: 'connected' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

//  API Routes 
app.use('/api/auth',        require('./backend/routes/auth'));
app.use('/api/devices',     require('./backend/routes/devices'));
app.use('/api/models',      require('./backend/routes/models'));
app.use('/api/technicians', require('./backend/routes/technicians'));
app.use('/api/admin',       require('./backend/routes/admin'));
app.use('/api/kit-accessories', require('./backend/routes/kit'));

// Ensure optional schema columns exist to avoid runtime SQL errors
(async function ensureSchema() {
  // Add `department` if missing (compatible with all MySQL versions)
  try {
    const [[deptCol]] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'department'"
    );
    if (!deptCol) {
      await pool.query("ALTER TABLE users ADD COLUMN department VARCHAR(255) DEFAULT NULL");
      console.log('Added users.department column');
    }
  } catch (e) {
    console.warn('Could not ensure users.department column:', e.message);
  }

  // Make `email` nullable so new users can be created without an email
  try {
    await pool.query("ALTER TABLE users MODIFY COLUMN email VARCHAR(255) DEFAULT NULL");
    console.log('Ensured users.email column is nullable');
  } catch (e) {
    console.warn('Could not ensure users.email is nullable:', e.message);
  }

  // Add `department` to `technicians` if missing (required for delivery-role filtering and POST)
  try {
    const [[techDeptCol]] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'technicians' AND COLUMN_NAME = 'department'"
    );
    if (!techDeptCol) {
      await pool.query("ALTER TABLE technicians ADD COLUMN department VARCHAR(255) DEFAULT NULL");
      console.log('Added technicians.department column');
    }
  } catch (e) {
    console.warn('Could not ensure technicians.department column:', e.message);
  }
})();

//  Start 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n Server running at http://localhost:${PORT}`);
  console.log(` Login page: http://localhost:${PORT}/login.html\n`);
});
