'use strict';
const express = require('express');
const pool    = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/models
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM models ORDER BY name');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/models
router.post('/', async (req, res) => {
  const { id, name, category, notes } = req.body;
  try {
    await pool.query(
      'INSERT INTO models (id, name, category, notes, createdAt) VALUES (?, ?, ?, ?, NOW())',
      [id, name, category, notes]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/models/:id
// Cascades to devices so orphaned device records are not left behind.
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM devices WHERE modelId=?', [req.params.id]);
    await pool.query('DELETE FROM models WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
