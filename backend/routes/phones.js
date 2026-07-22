'use strict';
const express = require('express');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

// ── Public router (no JWT) — safe fields only ────────────────────────────────
const publicRouter = express.Router();

/**
 * GET /api/phones/lookup?name=<receivedBy>&emp=<employeeNumber>
 * Returns a filtered, privacy-safe list of phone assignments for one person.
 * At least one query param is required to prevent dumping all records.
 * Sensitive fields (IMEI, signatureImage, photoImage) are omitted.
 */
publicRouter.get('/lookup', async (req, res) => {
  const { name, emp } = req.query;
  if (!name && !emp) {
    return res.status(400).json({ error: 'Provide at least one of: name, emp' });
  }

  try {
    let query = 'SELECT * FROM phones WHERE 1=0';
    const params = [];

    if (name) {
      query = 'SELECT * FROM phones WHERE LOWER(receivedBy) LIKE ?';
      params.push(`%${name.toLowerCase().trim()}%`);
      if (emp) {
        query += ' OR employeeNumber = ?';
        params.push(emp.trim());
      }
    } else if (emp) {
      query = 'SELECT * FROM phones WHERE employeeNumber = ?';
      params.push(emp.trim());
    }

    query += ' ORDER BY assignedAt DESC, createdAt DESC';
    const [rows] = await pool.query(query, params);

    // Strip sensitive fields before sending to the display screen
    const safe = rows.map(r => ({
      id:              r.id,
      phoneModel:      r.phoneModel,
      phoneNumber:     r.phoneNumber,
      assignedBy:      r.assignedBy,
      receivedBy:      r.receivedBy,
      employeeNumber:  r.employeeNumber,
      transactionType: r.transactionType || 'delivery',
      assignedAt:      r.assignedAt,
      notes:           r.notes,
    }));
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Private router (requires JWT) ────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function toMySqlDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeImei(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeTransactionType(value) {
  if (value === 'return') return 'return';
  if (value === 'return_admin') return 'return_admin';
  return 'delivery';
}

function getPublicPhoneRecord(record) {
  return {
    id: record.id,
    phoneModel: record.phoneModel,
    assignedBy: record.assignedBy,
    receivedBy: record.receivedBy,
    transactionType: record.transactionType || 'delivery',
    assignedAt: record.assignedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM phones ORDER BY assignedAt DESC, createdAt DESC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/display', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM phones WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Phone assignment not found' });
    }
    res.json(getPublicPhoneRecord(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM phones WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Phone assignment not found' });
    }
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  const {
    assignedBy,
    receivedBy,
    employeeNumber,
    phoneModel,
    imei,
    phoneNumber,
    assignedAt,
    transactionType,
    signatureName,
    signatureImage,
    photoImage,
    notes,
  } = req.body || {};

  const cleanImei = normalizeImei(imei);
  const cleanTransactionType = normalizeTransactionType(transactionType);

  if (!assignedBy || !receivedBy || !phoneModel || !cleanImei || !phoneNumber) {
    return res.status(400).json({ error: 'assignedBy, receivedBy, phoneModel, imei, and phoneNumber are required' });
  }

  if (cleanTransactionType !== 'return_admin' && (!signatureName || !signatureImage)) {
    return res.status(400).json({ error: 'signatureName and signatureImage are required' });
  }
  if (cleanImei.length > 15) {
    return res.status(400).json({ error: 'IMEI must be 15 digits or fewer' });
  }
  if (!/^\d+$/.test(cleanImei)) {
    return res.status(400).json({ error: 'IMEI must contain only numbers' });
  }

  try {
    const id = uid();
    const cleanTransactionType = normalizeTransactionType(transactionType);
    await pool.query(
      `INSERT INTO phones
       (id, assignedBy, receivedBy, employeeNumber, phoneModel, imei, phoneNumber, transactionType, assignedAt, signatureName, signatureImage, photoImage, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        assignedBy.trim(),
        receivedBy.trim(),
        (employeeNumber || '').trim() || null,
        phoneModel.trim(),
        cleanImei,
        phoneNumber.trim(),
        cleanTransactionType,
        toMySqlDateTime(assignedAt),
        signatureName.trim(),
        signatureImage || '',
        photoImage || null,
        (notes || '').trim() || null,
      ]
    );
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  const { notes, photoImage } = req.body || {};
  try {
    await pool.query(
      'UPDATE phones SET notes = ?, photoImage = COALESCE(?, photoImage), updatedAt = NOW() WHERE id = ?',
      [(notes || '').trim() || null, photoImage || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM phones WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.router = router;
module.exports.publicRouter = publicRouter;