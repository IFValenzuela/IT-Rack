const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Health check
app.get("/api/health", async (_req, res) => {
  try {
    const conn = await pool.getConnection();
    await conn.query("SELECT 1");
    conn.release();
    res.json({ ok: true, db: "connected" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Login endpoint
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, username, email, password, role FROM users WHERE username = ? LIMIT 1",
      [username]
    );

    if (!rows.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last login
    await pool.query("UPDATE users SET lastLogin = NOW() WHERE id = ?", [user.id]);

    // Create token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });

  } catch (e) {
    console.error("Login error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Verify token
app.get("/api/auth/verify", authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// Admin-only middleware
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// Admin: list all users
app.get("/api/admin/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, username, email, role, createdAt, lastLogin FROM users ORDER BY createdAt DESC"
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: create user
app.post("/api/admin/users", authenticateToken, requireAdmin, async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: "username, password and role are required" });
  }
  try {
    const [existing] = await pool.query("SELECT id FROM users WHERE username = ?", [username]);
    if (existing.length) return res.status(409).json({ error: "Username already taken" });
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, email, password, role, createdAt) VALUES (?, ?, ?, ?, NOW())",
      [username, email || null, hash, role]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: update user (role, email, optionally reset password)
app.put("/api/admin/users/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { role, email, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query("UPDATE users SET role=?, email=?, password=? WHERE id=?", [role, email || null, hash, req.params.id]);
    } else {
      await pool.query("UPDATE users SET role=?, email=? WHERE id=?", [role, email || null, req.params.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: delete user
app.delete("/api/admin/users/:id", authenticateToken, requireAdmin, async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }
  try {
    await pool.query("DELETE FROM users WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Device endpoints
app.get("/api/devices", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*, m.name as modelName 
      FROM devices d 
      LEFT JOIN models m ON d.modelId = m.id
      ORDER BY d.createdAt DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/devices", authenticateToken, async (req, res) => {
  const { id, modelId, serial, prNumber, status, department } = req.body;
  try {
    await pool.query(
      "INSERT INTO devices (id, modelId, serial, prNumber, status, department, addedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
      [id, modelId, serial, prNumber, status, department, req.user.username]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/devices/:id", authenticateToken, async (req, res) => {
  const { modelId, serial, prNumber, status, department, reason, deliveredBy, destination } = req.body;
  try {
    if (status === 'out') {
      // Removing from stock — save removal fields
      await pool.query(
        "UPDATE devices SET status=?, reason=?, deliveredBy=?, destination=?, removedAt=NOW() WHERE id=?",
        [status, reason || null, deliveredBy || null, destination || null, req.params.id]
      );
    } else {
      // Regular edit
      await pool.query(
        "UPDATE devices SET modelId=?, serial=?, prNumber=?, status=?, department=? WHERE id=?",
        [modelId, serial, prNumber, status, department, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/devices/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM devices WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Model endpoints
app.get("/api/models", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM models ORDER BY name");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/models", authenticateToken, async (req, res) => {
  const { id, name, category, notes } = req.body;
  try {
    await pool.query(
      "INSERT INTO models (id, name, category, notes, createdAt) VALUES (?, ?, ?, ?, NOW())",
      [id, name, category, notes]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: clear all data
app.delete("/api/admin/clear-all", authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM devices");
    await pool.query("DELETE FROM models");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Technicians endpoints
app.get("/api/technicians", authenticateToken, async (req, res) => {
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

app.post("/api/technicians", authenticateToken, async (req, res) => {
  const { name } = req.body;
  try {
    await pool.query("INSERT INTO technicians (name) VALUES (?)", [name]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📝 Login page: http://localhost:${PORT}/login.html\n`);
});