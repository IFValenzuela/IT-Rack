'use strict';
const express = require('express');
const pool    = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/technicians
// Merges the dedicated technicians table with non-admin/delivery user accounts,
// so both pools appear in the "Added by / Delivered by" dropdowns.
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT name FROM technicians
      UNION
      SELECT username AS name FROM users
        WHERE role != 'delivery' AND username != 'admin'
      ORDER BY name
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/technicians
router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    await pool.query('INSERT INTO technicians (name) VALUES (?)', [name.trim()]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
