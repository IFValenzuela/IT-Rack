'use strict';
const express       = require('express');
const bcrypt        = require('bcrypt');
const jwt           = require('jsonwebtoken');
const crypto        = require('crypto');
const pool          = require('../db/pool');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// GET /api/auth/users (Public list of usernames for login dropdown)
router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT username, role, department FROM users ORDER BY username ASC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, email, password, role, department FROM users WHERE username = ? LIMIT 1',
      [username]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await pool.query('UPDATE users SET lastLogin = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, department: user.department || null },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, department: user.department || null },
    });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/verify
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    // Always return success to prevent email enumeration
    if (!rows.length) {
      return res.json({ message: 'If that email is registered, a reset link has been sent.' });
    }

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [token, expires, rows[0].id]
    );

    // Attempt to send email; log link server-side as fallback
    try {
      const emailService = require('../services/email');
      await emailService.sendPasswordResetEmail(email, token);
    } catch (emailErr) {
      const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password.html?token=${token}`;
      console.log(`[Password Reset] Email failed — reset link for ${email}: ${resetUrl}`);
    }

    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW() LIMIT 1',
      [token]
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [hash, rows[0].id]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
