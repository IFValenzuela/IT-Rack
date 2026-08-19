'use strict';
const express = require('express');
const pool    = require('../db/pool');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();
router.use(authenticateToken);

// ── Pipeline status definitions (sequential order) ──────────
const PIPELINE_STATUSES = [
  'Ticket Created',
  'Manager Approval',
  'Requisition / Quote',
  'PR',
  'Awaiting Approval',
  'Awaiting Purchasing',
  'Warehouse Delivery',
  'IT Transit Time',
  'Add to Jira',
  'Equipment Preparation',
  'Delivery'
];

const VALID_STATUSES = [...PIPELINE_STATUSES, 'Cancelled'];

/**
 * Generate next ticket number: TKT-00001, TKT-00002, ...
 */
async function generateTicketNumber(conn) {
  const [[row]] = await conn.query(
    "SELECT ticket_number FROM pipeline_requests ORDER BY created_at DESC LIMIT 1"
  );
  if (!row) return 'TKT-00001';
  const num = parseInt(row.ticket_number.replace('TKT-', ''), 10) || 0;
  return `TKT-${String(num + 1).padStart(5, '0')}`;
}

function normalizeCategory(category) {
  const value = String(category || '').trim();
  return value || 'Other';
}

async function upsertModelByName(conn, name, category) {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    throw new Error('device_model is required');
  }

  const resolvedCategory = normalizeCategory(category);
  const [[existing]] = await conn.query(
    'SELECT id FROM models WHERE name = ? LIMIT 1',
    [cleanName]
  );

  if (existing) {
    await conn.query('UPDATE models SET category = ? WHERE id = ?', [resolvedCategory, existing.id]);
    return cleanName;
  }

  await conn.query(
    'INSERT INTO models (id, name, category, notes, createdAt) VALUES (?, ?, ?, ?, NOW())',
    [crypto.randomUUID(), cleanName, resolvedCategory, null]
  );
  return cleanName;
}

async function resolvePipelineDeviceModel(conn, body) {
  const modelId = String(body.device_model_id || '').trim();
  const legacyModelName = String(body.device_model || '').trim();
  const customModelName = String(body.device_model_custom || '').trim();
  const requestedCategory = normalizeCategory(body.device_model_category);

  if (customModelName) {
    return upsertModelByName(conn, customModelName, requestedCategory);
  }

  if (modelId) {
    const [[model]] = await conn.query(
      'SELECT id, name FROM models WHERE id = ? LIMIT 1',
      [modelId]
    );
    if (!model) {
      throw new Error('Selected model was not found');
    }
    return model.name;
  }

  if (legacyModelName) {
    return upsertModelByName(conn, legacyModelName, requestedCategory);
  }

  throw new Error('device_model is required');
}

// ── GET /api/pipeline — list all requests ────────────────────
router.get('/', async (req, res) => {
  try {
    const statusFilter = req.query.status;
    let sql = `
      SELECT pr.*,
             COALESCE(ser.serial_count, 0) AS serial_count
      FROM pipeline_requests pr
      LEFT JOIN (
        SELECT prNumber, COUNT(*) AS serial_count
        FROM devices
        WHERE serial IS NOT NULL
          AND TRIM(serial) <> ''
          AND UPPER(TRIM(serial)) <> 'N/A'
        GROUP BY prNumber
      ) ser ON ser.prNumber = pr.ticket_number
      ORDER BY pr.created_at DESC
    `;
    const params = [];
    if (statusFilter) {
      sql = `
        SELECT pr.*,
               COALESCE(ser.serial_count, 0) AS serial_count
        FROM pipeline_requests pr
        LEFT JOIN (
          SELECT prNumber, COUNT(*) AS serial_count
          FROM devices
          WHERE serial IS NOT NULL
            AND TRIM(serial) <> ''
            AND UPPER(TRIM(serial)) <> 'N/A'
          GROUP BY prNumber
        ) ser ON ser.prNumber = pr.ticket_number
        WHERE pr.current_status = ?
        ORDER BY pr.created_at DESC
      `;
      params.push(statusFilter);
    }
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/pipeline/stats/stage-durations — SLA analytics ──
router.get('/stats/stage-durations', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        h1.status_name AS from_stage,
        h2.status_name AS to_stage,
        ROUND(AVG(TIMESTAMPDIFF(SECOND, h1.timestamp, h2.timestamp)) / 3600, 2) AS avg_hours,
        ROUND(MIN(TIMESTAMPDIFF(SECOND, h1.timestamp, h2.timestamp)) / 3600, 2) AS min_hours,
        ROUND(MAX(TIMESTAMPDIFF(SECOND, h1.timestamp, h2.timestamp)) / 3600, 2) AS max_hours,
        COUNT(*) AS sample_count
      FROM pipeline_history h1
      JOIN pipeline_history h2
        ON h1.ticket_number = h2.ticket_number
        AND h2.id = (
          SELECT MIN(h3.id) FROM pipeline_history h3
          WHERE h3.ticket_number = h1.ticket_number AND h3.id > h1.id
        )
      WHERE h1.status_name != 'Cancelled'
        AND h2.status_name != 'Cancelled'
      GROUP BY h1.status_name, h2.status_name
      ORDER BY FIELD(h1.status_name,
        'Ticket Created', 'Manager Approval', 'Requisition / Quote', 'PR',
        'Awaiting Approval', 'Awaiting Purchasing', 'Warehouse Delivery', 'IT Transit Time',
        'Add to Jira', 'Equipment Preparation', 'Delivery')
    `);
    res.json(rows);
  } catch (e) {
    console.error('Pipeline stage-durations error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/pipeline/stats/summary — overview counters ──────
router.get('/stats/summary', async (_req, res) => {
  try {
    const [statusCounts] = await pool.query(`
      SELECT current_status, COUNT(*) AS count
      FROM pipeline_requests
      GROUP BY current_status
    `);

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM pipeline_requests'
    );
    const [[{ completed }]] = await pool.query(
      "SELECT COUNT(*) AS completed FROM pipeline_requests WHERE current_status = 'Delivery'"
    );
    const [[{ cancelled }]] = await pool.query(
      "SELECT COUNT(*) AS cancelled FROM pipeline_requests WHERE current_status = 'Cancelled'"
    );
    const active = total - completed - cancelled;

    // Average total cycle time (Ticket → Final Delivery) in hours
    const [[cycleRow]] = await pool.query(`
      SELECT ROUND(AVG(TIMESTAMPDIFF(SECOND, first_ts.ts, last_ts.ts)) / 3600, 2) AS avg_cycle_hours
      FROM (
        SELECT ticket_number, MIN(timestamp) AS ts
        FROM pipeline_history WHERE status_name = 'Ticket Created'
        GROUP BY ticket_number
      ) first_ts
      JOIN (
        SELECT ticket_number, MAX(timestamp) AS ts
        FROM pipeline_history WHERE status_name = 'Delivery'
        GROUP BY ticket_number
      ) last_ts ON first_ts.ticket_number = last_ts.ticket_number
    `);

    res.json({
      total,
      active,
      completed,
      cancelled,
      avgCycleHours: cycleRow.avg_cycle_hours || null,
      statusCounts: statusCounts.reduce((acc, r) => {
        acc[r.current_status] = Number(r.count);
        return acc;
      }, {}),
    });
  } catch (e) {
    console.error('Pipeline summary error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/pipeline/:ticket_number — single request + history + devices
router.get('/:ticket_number', async (req, res) => {
  try {
    const [[request]] = await pool.query(
      'SELECT * FROM pipeline_requests WHERE ticket_number = ?',
      [req.params.ticket_number]
    );
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const [history] = await pool.query(
      'SELECT * FROM pipeline_history WHERE ticket_number = ? ORDER BY timestamp ASC, id ASC',
      [req.params.ticket_number]
    );
    
    let devices = [];
    try {
      const [devRows] = await pool.query(
        'SELECT serial, asset_tag FROM devices WHERE prNumber = ?',
        [req.params.ticket_number]
      );
      devices = devRows;
    } catch (e) {
      console.warn("Could not fetch devices for ticket:", e.message);
    }
    
    res.json({ request: { ...request, devices }, history });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/pipeline — create new request ──────────────────
router.post('/', async (req, res) => {
  const { requested_by, assigned_to, notes, jira_ticket, department } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let deviceModel;
    try {
      deviceModel = await resolvePipelineDeviceModel(conn, req.body);
    } catch (modelErr) {
      await conn.rollback();
      return res.status(400).json({ error: modelErr.message });
    }

    const ticketNumber = await generateTicketNumber(conn);
    const initialStatus = 'Ticket Created';

    await conn.query(
      `INSERT INTO pipeline_requests
         (ticket_number, device_model, requested_by, department, current_status, assigned_to, notes, jira_ticket, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [ticketNumber, deviceModel, requested_by || null, department || null, initialStatus, assigned_to || null, notes || null, jira_ticket || null]
    );

    await conn.query(
      `INSERT INTO pipeline_history
         (ticket_number, status_name, handled_by, notes, timestamp)
       VALUES (?, ?, ?, ?, NOW())`,
      [ticketNumber, initialStatus, req.user.username, notes || null]
    );

    await conn.commit();
    res.json({ ok: true, ticket_number: ticketNumber });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ── PUT /api/pipeline/:ticket_number/advance — next stage ────
// ── PUT /api/pipeline/:ticket_number — partial update (assigned_to, checklist)
router.put('/:ticket_number', async (req, res) => {
  const { assigned_to, checklist } = req.body;
  const ticketNumber = req.params.ticket_number;
  
  try {
    const updates = [];
    const params = [];
    
    if (assigned_to !== undefined) {
      updates.push("assigned_to = ?");
      params.push(assigned_to || null);
    }
    if (checklist !== undefined) {
      updates.push("checklist = ?");
      params.push(JSON.stringify(checklist));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    
    params.push(ticketNumber);
    const sql = `UPDATE pipeline_requests SET ${updates.join(', ')} WHERE ticket_number = ?`;
    
    const [result] = await pool.query(sql, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    res.json({ ok: true, ticket_number: ticketNumber });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:ticket_number/advance', async (req, res) => {
  const { target_status, notes } = req.body;
  const ticketNumber = req.params.ticket_number;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the row to prevent concurrent updates
    const [[request]] = await conn.query(
      'SELECT * FROM pipeline_requests WHERE ticket_number = ? FOR UPDATE',
      [ticketNumber]
    );
    if (!request) {
      await conn.rollback();
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.current_status === 'Cancelled') {
      await conn.rollback();
      return res.status(400).json({ error: 'Cannot advance a cancelled request' });
    }

    const currentIdx = PIPELINE_STATUSES.indexOf(request.current_status);
    let nextStatus;

    if (target_status) {
      // Explicit target — validate it exists
      if (!PIPELINE_STATUSES.includes(target_status)) {
        await conn.rollback();
        return res.status(400).json({ error: `Invalid target status: ${target_status}` });
      }
      const targetIdx = PIPELINE_STATUSES.indexOf(target_status);

      // Backward moves allowed to support going back and forth
      if (targetIdx === currentIdx) {
        await conn.rollback();
        return res.status(400).json({ error: 'Already at this stage' });
      }
      nextStatus = target_status;
    } else {
      // Auto-advance to next sequential stage
      if (currentIdx === PIPELINE_STATUSES.length - 1) {
        await conn.rollback();
        return res.status(400).json({ error: 'Already at the final stage (Final Delivery)' });
      }
      nextStatus = PIPELINE_STATUSES[currentIdx + 1];
    }

    const handledBy = req.user.username;
    const historyNotes = notes || null;

    if (request.current_status === 'Add to Jira') {
      const hasJiraId = typeof historyNotes === 'string' && /jira\s*id\s*:/i.test(historyNotes);
      if (!hasJiraId) {
        await conn.rollback();
        return res.status(400).json({ error: 'Jira ID is required before continuing from Add to Jira' });
      }
    }

    // Block advance past Equipment Preparation if no serial number has been added
    if (request.current_status === 'Equipment Preparation' || nextStatus === 'Delivery') {
      const [[serialRow]] = await conn.query(
        `SELECT COUNT(*) AS serial_count
         FROM devices
         WHERE prNumber = ?
           AND serial IS NOT NULL
           AND TRIM(serial) <> ''`,
        [ticketNumber]
      );
      if (!serialRow || Number(serialRow.serial_count) === 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'A serial number must be added before advancing past Equipment Preparation. Please add the device serial first.' });
      }
    }

    await conn.query(
      'UPDATE pipeline_requests SET current_status = ?, assigned_to = ?, updated_at = NOW() WHERE ticket_number = ?',
      [nextStatus, handledBy, ticketNumber]
    );

    await conn.query(
      'INSERT INTO pipeline_history (ticket_number, status_name, handled_by, notes, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [ticketNumber, nextStatus, handledBy, historyNotes]
    );

    await conn.commit();
    res.json({ ok: true, ticket_number: ticketNumber, new_status: nextStatus });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ── PUT /api/pipeline/:ticket_number/cancel — cancel request ─
router.put('/:ticket_number/cancel', async (req, res) => {
  const ticketNumber = req.params.ticket_number;
  const { notes } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[request]] = await conn.query(
      'SELECT * FROM pipeline_requests WHERE ticket_number = ? FOR UPDATE',
      [ticketNumber]
    );
    if (!request) {
      await conn.rollback();
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.current_status === 'Cancelled') {
      await conn.rollback();
      return res.status(400).json({ error: 'Already cancelled' });
    }
    if (request.current_status === 'Final Delivery') {
      await conn.rollback();
      return res.status(400).json({ error: 'Cannot cancel a completed request' });
    }

    await conn.query(
      "UPDATE pipeline_requests SET current_status = 'Cancelled', updated_at = NOW() WHERE ticket_number = ?",
      [ticketNumber]
    );
    await conn.query(
      "INSERT INTO pipeline_history (ticket_number, status_name, handled_by, notes, timestamp) VALUES (?, 'Cancelled', ?, ?, NOW())",
      [ticketNumber, req.user.username, notes || null]
    );

    await conn.commit();
    res.json({ ok: true, ticket_number: ticketNumber, new_status: 'Cancelled' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ── DELETE /api/pipeline/:ticket_number — admin only ─────────
router.delete('/:ticket_number', requireAdmin, async (req, res) => {
  try {
    if (req.user.username !== 'admin') {
      return res.status(403).json({ error: 'Main admin access required' });
    }

    const [result] = await pool.query(
      'DELETE FROM pipeline_requests WHERE ticket_number = ?',
      [req.params.ticket_number]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
