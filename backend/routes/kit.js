'use strict';
const express = require('express');
const pool    = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/kit-accessories — available to every authenticated role
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, no_serial, category, sort_order FROM kit_accessories ORDER BY sort_order ASC, name ASC'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
