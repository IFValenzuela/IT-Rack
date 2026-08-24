'use strict';
const express = require('express');
const bcrypt  = require('bcrypt');
const pool    = require('../db/pool');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
// All admin routes require authentication AND admin role.
router.use(authenticateToken, requireAdmin);

// GET /api/admin/users
router.get('/users', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, username, role, department, createdAt, lastLogin FROM users
      ORDER BY
        FIELD(role, 'admin', 'technician', 'delivery', 'viewer'),
        username ASC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  const { username, password, role, department } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'username, password and role are required' });
  }
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password, role, department, createdAt) VALUES (?, ?, ?, ?, NOW())',
      [username, hash, role, department || null]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  const { role, password, department } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET role=?, password=?, department=? WHERE id=?',
        [role, hash, department || null, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE users SET role=?, department=? WHERE id=?',
        [role, department || null, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res, next) => {
  // Prevent self-deletion
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  next();
}, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Kit Accessories ─────────────────────────────────────────

// GET /api/admin/kit-accessories
router.get('/kit-accessories', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, no_serial, category, sort_order FROM kit_accessories ORDER BY sort_order ASC, name ASC'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/kit-accessories
router.post('/kit-accessories', async (req, res) => {
  const { name, no_serial = 0, category = 'Other' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    // Auto-assign sort_order: max of non-Other items + 10 (before "Other" at 9999)
    const [[maxRow]] = await pool.query(
      "SELECT COALESCE(MAX(sort_order), 0) AS m FROM kit_accessories WHERE name != 'Other'"
    );
    const sort_order = Math.min((maxRow.m || 0) + 10, 9990);
    const [result] = await pool.query(
      'INSERT INTO kit_accessories (name, no_serial, category, sort_order) VALUES (?, ?, ?, ?)',
      [name.trim(), no_serial ? 1 : 0, category, sort_order]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An item with that name already exists.' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/admin/kit-accessories/reorder  — must be defined BEFORE /:id
router.put('/kit-accessories/reorder', async (req, res) => {
  const { order } = req.body; // array of ids in desired display order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of ids' });
  try {
    for (let i = 0; i < order.length; i++) {
      await pool.query('UPDATE kit_accessories SET sort_order=? WHERE id=?', [(i + 1) * 10, order[i]]);
    }
    // Keep "Other" always at the end
    await pool.query("UPDATE kit_accessories SET sort_order=9999 WHERE name='Other'");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/admin/kit-accessories/:id
router.put('/kit-accessories/:id', async (req, res) => {
  const { name, no_serial = 0, category = 'Other' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    await pool.query(
      'UPDATE kit_accessories SET name=?, no_serial=?, category=? WHERE id=?',
      [name.trim(), no_serial ? 1 : 0, category, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An item with that name already exists.' });
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/kit-accessories/:id
router.delete('/kit-accessories/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM kit_accessories WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/clear-all
router.delete('/clear-all', async (_req, res) => {
  try {
    await pool.query('DELETE FROM devices');
    await pool.query('DELETE FROM models');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Demo Mode ────────────────────────────────────────────────

// POST /api/admin/demo/seed  — builds a presentation set from existing records
router.post('/demo/seed', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [models] = await conn.query(
      "SELECT id FROM models WHERE id NOT LIKE 'DEMO-%'"
    );
    const [deviceTemplates] = await conn.query(
      "SELECT * FROM devices WHERE id NOT LIKE 'DEMO-%' ORDER BY createdAt DESC"
    );
    if (!models.length || !deviceTemplates.length) {
      return res.status(400).json({ error: 'Add at least one existing model and device before seeding presentation data.' });
    }

    const addedBy = req.user.username;
    await conn.beginTransaction();
    await conn.query("DELETE FROM pipeline_requests WHERE ticket_number LIKE 'DEMO-%'");
    await conn.query("DELETE FROM phones WHERE id LIKE 'DEMO-%'");
    await conn.query("DELETE FROM devices WHERE id LIKE 'DEMO-%'");

    const ageDays = [0, 1, 2, 16, 18, 22, 35, 40, 50];
    for (let index = 0; index < 9; index++) {
      const source = deviceTemplates[index % deviceTemplates.length];
      const daysAgo = ageDays[index % ageDays.length];
      const status = index === 8 ? 'out' : 'in';
      await conn.query(
        `INSERT INTO devices
         (id, modelId, serial, prNumber, status, department, addedBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [
          `DEMO-${index < 3 ? 'FRESH' : index < 6 ? 'WARN' : 'CRIT'}-${String(index % 3 + 1).padStart(3, '0')}`,
          source.modelId || models[index % models.length].id,
          `DEMO-${String(source.serial || 'SERIAL').replace(/[^a-z0-9]/gi, '').slice(0, 18)}-${String(index + 1).padStart(3, '0')}`,
          `DEMO-${String(source.prNumber || 'PR').replace(/[^a-z0-9]/gi, '').slice(0, 12)}-${String(index + 1).padStart(3, '0')}`,
          status,
          source.department || null,
          addedBy,
          daysAgo,
        ]
      );
    }

    const [phoneTemplates] = await conn.query(
      "SELECT * FROM phones WHERE id NOT LIKE 'DEMO-%' ORDER BY assignedAt DESC"
    );
    for (let index = 0; index < Math.min(6, phoneTemplates.length * 2); index++) {
      const source = phoneTemplates[index % phoneTemplates.length];
      const daysAgo = [1, 4, 9, 15, 23, 31][index];
      await conn.query(
        `INSERT INTO phones
         (id, assignedBy, receivedBy, employeeNumber, phoneModel, imei, phoneNumber,
          assignedAt, signatureName, signatureImage, photoImage, notes, transactionType,
          createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY), ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          `DEMO-PHONE-${String(index + 1).padStart(3, '0')}`,
          source.assignedBy,
          source.receivedBy,
          source.employeeNumber,
          source.phoneModel,
          source.imei,
          source.phoneNumber,
          daysAgo,
          source.signatureName,
          source.signatureImage,
          source.photoImage,
          source.notes,
          source.transactionType || 'delivery',
        ]
      );
    }

    const [pipelineTemplates] = await conn.query(
      "SELECT * FROM pipeline_requests WHERE ticket_number NOT LIKE 'DEMO-%' ORDER BY created_at DESC"
    );
    const pipelineStages = [
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
      'Delivery',
    ];
    let pipelineCount = 0;
    for (let index = 0; index < pipelineStages.length && pipelineTemplates.length; index++) {
      const source = pipelineTemplates[index % pipelineTemplates.length];
      const ticketNumber = `DEMO-TKT-${String(index + 1).padStart(3, '0')}`;
      const daysAgo = pipelineStages.length - index;
      await conn.query(
        `INSERT INTO pipeline_requests
         (ticket_number, device_model, requested_by, current_status, assigned_to, notes,
          jira_ticket, checklist, created_at, updated_at, department)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY), NOW(), ?)`,
        [ticketNumber, source.device_model, source.requested_by, pipelineStages[index], source.assigned_to,
        source.notes, source.jira_ticket, source.checklist, daysAgo, source.department]
      );
      for (let stageIndex = 0; stageIndex <= index; stageIndex++) {
        await conn.query(
          'INSERT INTO pipeline_history (ticket_number, status_name, handled_by, notes, timestamp) VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))',
          [ticketNumber, pipelineStages[stageIndex], source.assigned_to || source.requested_by || addedBy,
          stageIndex === 0 ? source.notes : null, daysAgo + index - stageIndex]
        );
      }
      pipelineCount++;
    }

    await conn.commit();
    res.json({ ok: true, inserted: { devices: 9, phones: Math.min(6, phoneTemplates.length * 2), pipeline: pipelineCount } });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// DELETE /api/admin/demo/cleanup  — removes all presentation demo records
router.delete('/demo/cleanup', async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [pipelineResult] = await conn.query("DELETE FROM pipeline_requests WHERE ticket_number LIKE 'DEMO-%'");
    const [phoneResult] = await conn.query("DELETE FROM phones WHERE id LIKE 'DEMO-%'");
    const [deviceResult] = await conn.query("DELETE FROM devices WHERE id LIKE 'DEMO-%'");
    await conn.commit();
    res.json({ ok: true, removed: {
      devices: deviceResult.affectedRows,
      phones: phoneResult.affectedRows,
      pipeline: pipelineResult.affectedRows,
    } });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
