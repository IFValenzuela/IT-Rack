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
      SELECT id, username, email, role, department, createdAt, lastLogin FROM users
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
  const { username, email, password, role, department } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'username, password and role are required' });
  }
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, email, password, role, department, createdAt) VALUES (?, ?, ?, ?, ?, NOW())',
      [username, email || null, hash, role, department || null]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  const { role, email, password, department } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET role=?, email=?, password=?, department=? WHERE id=?',
        [role, email || null, hash, department || null, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE users SET role=?, email=?, department=? WHERE id=?',
        [role, email || null, department || null, req.params.id]
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

// POST /api/admin/demo/seed  — injects demo devices backdated for yellow/red badges
router.post('/demo/seed', async (req, res) => {
  try {
    // Need at least one model to attach devices to
    const [models] = await pool.query(
      "SELECT id FROM models WHERE id NOT LIKE 'DEMO-%' LIMIT 1"
    );
    if (!models.length) {
      return res.status(400).json({ error: 'No models found. Add at least one model before seeding demo data.' });
    }
    const modelId = models[0].id;
    const addedBy = req.user.username;

    // Remove any leftover demo data first
    await pool.query("DELETE FROM devices WHERE id LIKE 'DEMO-%'");

    // 3 fresh devices (no badge)
    const freshDevices = [
      ['DEMO-FRESH-001', 'DEMO-SN-F001', 'PR-DEMO-01'],
      ['DEMO-FRESH-002', 'DEMO-SN-F002', 'PR-DEMO-02'],
      ['DEMO-FRESH-003', 'DEMO-SN-F003', 'PR-DEMO-03'],
    ];
    for (const [id, serial, prNumber] of freshDevices) {
      await pool.query(
        'INSERT INTO devices (id, modelId, serial, prNumber, status, department, addedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
        [id, modelId, serial, prNumber, 'in', 'IT Dept', addedBy]
      );
    }

    // 3 devices 16 days old → yellow "2+ weeks" badge
    const warningDevices = [
      ['DEMO-WARN-001', 'DEMO-SN-W001', 'PR-DEMO-04'],
      ['DEMO-WARN-002', 'DEMO-SN-W002', 'PR-DEMO-05'],
      ['DEMO-WARN-003', 'DEMO-SN-W003', 'PR-DEMO-06'],
    ];
    for (const [id, serial, prNumber] of warningDevices) {
      await pool.query(
        'INSERT INTO devices (id, modelId, serial, prNumber, status, department, addedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 16 DAY))',
        [id, modelId, serial, prNumber, 'in', 'IT Dept', addedBy]
      );
    }

    // 3 devices 35 days old → red "1+ month" badge
    const criticalDevices = [
      ['DEMO-CRIT-001', 'DEMO-SN-C001', 'PR-DEMO-07'],
      ['DEMO-CRIT-002', 'DEMO-SN-C002', 'PR-DEMO-08'],
      ['DEMO-CRIT-003', 'DEMO-SN-C003', 'PR-DEMO-09'],
    ];
    for (const [id, serial, prNumber] of criticalDevices) {
      await pool.query(
        'INSERT INTO devices (id, modelId, serial, prNumber, status, department, addedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 35 DAY))',
        [id, modelId, serial, prNumber, 'in', 'IT Dept', addedBy]
      );
    }

    res.json({ ok: true, inserted: 9 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/demo/cleanup  — removes all demo devices
router.delete('/demo/cleanup', async (_req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM devices WHERE id LIKE 'DEMO-%'");
    res.json({ ok: true, removed: result.affectedRows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
