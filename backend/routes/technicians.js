'use strict';
const express = require('express');
const pool    = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/technicians
// For delivery window users: returns only people in the same department.
// For everyone else: returns all.
router.get('/', async (req, res) => {
  const { role, department } = req.user;
  try {
    if (role === 'delivery' && department) {
      // Only show people in the same department, plus technicians with no department (global)
      // Exclude admin accounts
      const [rows] = await pool.query(`
        SELECT name FROM technicians
          WHERE department = ? OR department IS NULL
        UNION
        SELECT username AS name FROM users
          WHERE role != 'delivery' AND role != 'admin' AND department = ?
        ORDER BY name
      `, [department, department]);
      return res.json(rows);
    }
    // Admin / technician / viewer — see everyone except admin accounts
    const [rows] = await pool.query(`
      SELECT name FROM technicians
      UNION
      SELECT username AS name FROM users
        WHERE role != 'delivery' AND role != 'admin'
      ORDER BY name
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/technicians
router.post('/', async (req, res) => {
  const { name, department } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    await pool.query('INSERT INTO technicians (name, department) VALUES (?, ?)', [name.trim(), department || null]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
