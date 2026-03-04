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
    const [rows] = await pool.query(
      'SELECT id, username, email, role, createdAt, lastLogin FROM users ORDER BY createdAt DESC'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'username, password and role are required' });
  }
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, email, password, role, createdAt) VALUES (?, ?, ?, ?, NOW())',
      [username, email || null, hash, role]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  const { role, email, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET role=?, email=?, password=? WHERE id=?',
        [role, email || null, hash, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE users SET role=?, email=? WHERE id=?',
        [role, email || null, req.params.id]
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
  const { name, no_serial = 0, category = 'Other', sort_order = 0 } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const [result] = await pool.query(
      'INSERT INTO kit_accessories (name, no_serial, category, sort_order) VALUES (?, ?, ?, ?)',
      [name.trim(), no_serial ? 1 : 0, category, Number(sort_order) || 0]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An item with that name already exists.' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/admin/kit-accessories/:id
router.put('/kit-accessories/:id', async (req, res) => {
  const { name, no_serial = 0, category = 'Other', sort_order = 0 } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    await pool.query(
      'UPDATE kit_accessories SET name=?, no_serial=?, category=?, sort_order=? WHERE id=?',
      [name.trim(), no_serial ? 1 : 0, category, Number(sort_order) || 0, req.params.id]
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

module.exports = router;
