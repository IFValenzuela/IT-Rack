'use strict';
const express = require('express');
const cors    = require('cors');
require('dotenv').config();
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(express.static('public'));

// Allow running without a DB: either pass --static or set STATIC_ONLY=1
const STATIC_ONLY = process.argv.includes('--static') || process.env.STATIC_ONLY === '1';

let pool = null;
if (!STATIC_ONLY && process.env.DB_HOST) {
  try {
    pool = require('./backend/db/pool');
  } catch (e) {
    console.warn('DB pool load failed — continuing in static mode:', e.message);
    pool = null;
  }
} else if (STATIC_ONLY) {
  console.log('Starting in static-only mode (no DB).');
}

// Health check — if DB present, verify; otherwise report static mode
app.get('/api/health', async (_req, res) => {
  if (pool) {
    try {
      const conn = await pool.getConnection();
      await conn.query('SELECT 1');
      conn.release();
      res.json({ ok: true, db: 'connected' });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  } else {
    res.json({ ok: true, db: 'disabled' });
  }
});

// If DB is available, mount API routes that require it
if (pool) {
  // Public route — no JWT required (safe display fields only)
  const phonesModule = require('./backend/routes/phones');
  app.use('/api/phones', phonesModule.publicRouter);

  app.use('/api/auth',        require('./backend/routes/auth'));
  app.use('/api/devices',     require('./backend/routes/devices'));
  app.use('/api/phones',      phonesModule.router);
  app.use('/api/models',      require('./backend/routes/models'));
  app.use('/api/technicians', require('./backend/routes/technicians'));
  app.use('/api/admin',       require('./backend/routes/admin'));
  app.use('/api/kit-accessories', require('./backend/routes/kit'));

  // Ensure optional schema columns exist to avoid runtime SQL errors
  (async function ensureSchema() {
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

    try {
      await pool.query("ALTER TABLE users MODIFY COLUMN email VARCHAR(255) DEFAULT NULL");
      console.log('Ensured users.email column is nullable');
    } catch (e) {
      console.warn('Could not ensure users.email is nullable:', e.message);
    }

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

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS phones (
          id varchar(50) NOT NULL,
          assignedBy varchar(255) NOT NULL,
          receivedBy varchar(255) NOT NULL,
          employeeNumber varchar(100) DEFAULT NULL,
          phoneModel varchar(255) NOT NULL,
          imei varchar(100) NOT NULL,
          phoneNumber varchar(50) NOT NULL,
          assignedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          signatureName varchar(255) NOT NULL,
          signatureImage LONGTEXT NOT NULL,
          photoImage LONGTEXT DEFAULT NULL,
          notes text,
          createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY receivedBy_idx (receivedBy),
          KEY assignedBy_idx (assignedBy),
          KEY employeeNumber_idx (employeeNumber),
          KEY imei_idx (imei)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      console.log('Ensured phones table exists');
    } catch (e) {
      console.warn('Could not ensure phones table exists:', e.message);
    }
  })();
} else {
  console.log('DB not configured — API routes disabled. Serving static files only.');
}

//  Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n Server running at http://localhost:${PORT}`);
  console.log(` Login page: http://localhost:${PORT}/login.html\n`);
});
