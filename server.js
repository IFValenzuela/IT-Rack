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

//  Start 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n Server running at http://localhost:${PORT}`);
  console.log(` Login page: http://localhost:${PORT}/login.html\n`);
});
