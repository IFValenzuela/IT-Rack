'use strict';
const express = require('express');
const pool    = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/devices
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*, m.name AS modelName
      FROM   devices d
      LEFT JOIN models m ON d.modelId = m.id
      ORDER BY d.createdAt DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/devices
router.post('/', async (req, res) => {
  const { id, modelId, serial, prNumber, status, department, kit_id, addedBy } = req.body;
  // Use provided addedBy (admin recording on behalf of a technician) or fall back to JWT user
  const effectiveAddedBy = (addedBy || '').trim() || req.user.username;
  try {
    await pool.query(
      'INSERT INTO devices (id, modelId, serial, prNumber, status, department, addedBy, kit_id, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [id, modelId, serial, prNumber, status, department, effectiveAddedBy, kit_id || null]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/devices/:id
router.put('/:id', async (req, res) => {
  const { modelId, serial, prNumber, status, department, reason, deliveredBy, destination } = req.body;
  try {
    if (status === 'out') {
      // Removing from stock — record removal metadata
      await pool.query(
        'UPDATE devices SET status=?, reason=?, deliveredBy=?, destination=?, removedAt=NOW() WHERE id=?',
        [status, reason || null, deliveredBy || null, destination || null, req.params.id]
      );
    } else {
      // Regular field edit
      await pool.query(
        'UPDATE devices SET modelId=?, serial=?, prNumber=?, status=?, department=? WHERE id=?',
        [modelId, serial, prNumber, status, department, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/devices/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM devices WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
