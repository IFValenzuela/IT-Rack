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
  app.use('/api/stats',       require('./backend/routes/stats'));
  app.use('/api/tickets',     require('./backend/routes/tickets'));
  app.use('/api/pipeline',    require('./backend/routes/pipeline'));

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
          transactionType varchar(50) DEFAULT 'delivery',
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

    try {
      const [[receivedByCol]] = await pool.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'receivedBy'"
      );
      if (!receivedByCol) {
        await pool.query("ALTER TABLE devices ADD COLUMN receivedBy VARCHAR(255) DEFAULT NULL AFTER addedBy");
        console.log('Added devices.receivedBy column');
      }
    } catch (e) {
      console.warn('Could not ensure devices.receivedBy column:', e.message);
    }

    try {
      const [[txCol]] = await pool.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phones' AND COLUMN_NAME = 'transactionType'"
      );
      if (!txCol) {
        await pool.query("ALTER TABLE phones ADD COLUMN transactionType VARCHAR(50) DEFAULT 'delivery'");
        console.log('Added phones.transactionType column');
      }
    } catch (e) {
      console.warn('Could not ensure phones.transactionType column:', e.message);
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tickets (
          id varchar(50) NOT NULL,
          title varchar(255) NOT NULL,
          requester varchar(255) DEFAULT NULL,
          status varchar(50) NOT NULL DEFAULT 'First Requirement',
          notes text,
          createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      console.log('Ensured tickets table exists');
    } catch (e) {
      console.warn('Could not ensure tickets table exists:', e.message);
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pipeline_requests (
          ticket_number VARCHAR(20) NOT NULL,
          device_model  VARCHAR(255) NOT NULL,
          requested_by  VARCHAR(255) DEFAULT NULL,
          current_status VARCHAR(60) NOT NULL DEFAULT 'Ticket',
          assigned_to   VARCHAR(255) DEFAULT NULL,
          notes         TEXT,
          jira_ticket   VARCHAR(100) DEFAULT NULL,
          created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (ticket_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      console.log('Ensured pipeline_requests table exists');
    } catch (e) {
      console.warn('Could not ensure pipeline_requests table:', e.message);
    }

    try {
      const [[jiraTicketCol]] = await pool.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pipeline_requests' AND COLUMN_NAME = 'jira_ticket'"
      );
      if (!jiraTicketCol) {
        await pool.query("ALTER TABLE pipeline_requests ADD COLUMN jira_ticket VARCHAR(100) DEFAULT NULL AFTER notes");
        console.log('Added pipeline_requests.jira_ticket column');
      }
    } catch (e) {
      console.warn('Could not ensure pipeline_requests.jira_ticket column:', e.message);
    }

    try {
      const [[checklistCol]] = await pool.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pipeline_requests' AND COLUMN_NAME = 'checklist'"
      );
      if (!checklistCol) {
        await pool.query("ALTER TABLE pipeline_requests ADD COLUMN checklist JSON DEFAULT NULL AFTER jira_ticket");
        console.log('Added pipeline_requests.checklist column');
      }
    } catch (e) {
      console.warn('Could not ensure pipeline_requests.checklist column:', e.message);
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pipeline_history (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          ticket_number VARCHAR(20) NOT NULL,
          status_name   VARCHAR(60) NOT NULL,
          timestamp     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          handled_by    VARCHAR(255) DEFAULT NULL,
          notes         TEXT,
          FOREIGN KEY (ticket_number) REFERENCES pipeline_requests(ticket_number) ON DELETE CASCADE,
          KEY idx_ph_ticket (ticket_number),
          KEY idx_ph_timestamp (timestamp)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      console.log('Ensured pipeline_history table exists');
    } catch (e) {
      console.warn('Could not ensure pipeline_history table:', e.message);
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
