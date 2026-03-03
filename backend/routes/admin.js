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
