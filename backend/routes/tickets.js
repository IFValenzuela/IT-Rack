'use strict';
const express = require('express');
const pool    = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();
router.use(authenticateToken);

// GET /api/tickets
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tickets ORDER BY createdAt DESC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tickets
router.post('/', async (req, res) => {
  const { title, requester, notes } = req.body;
  const id = crypto.randomUUID();
  try {
    await pool.query(
      'INSERT INTO tickets (id, title, requester, notes, status, createdAt) VALUES (?, ?, ?, ?, ?, NOW())',
      [id, title, requester, notes, 'First Requirement']
    );
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/tickets/:id/status
router.put('/:id/status', async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query('UPDATE tickets SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/tickets/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tickets WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
