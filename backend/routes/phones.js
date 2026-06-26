'use strict';
const express = require('express');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

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
  return value === 'return' ? 'return' : 'delivery';
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
  if (!assignedBy || !receivedBy || !phoneModel || !cleanImei || !phoneNumber || !signatureName || !signatureImage) {
    return res.status(400).json({ error: 'assignedBy, receivedBy, phoneModel, imei, phoneNumber, signatureName and signatureImage are required' });
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
        signatureImage,
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