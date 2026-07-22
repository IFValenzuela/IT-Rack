'use strict';
const express = require('express');
const pool    = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/stats/devices-by-category
 * Returns devices grouped by category, with models nested inside each category.
 * Response shape:
 *   { categories: [ { category, deviceCount, models: [ { modelId, modelName, deviceCount, devices: [...] } ] } ] }
 */
router.get('/devices-by-category', async (_req, res) => {
  try {
    // 1. Get all models with their categories
    const [models] = await pool.query(`
      SELECT
        m.id        AS modelId,
        m.name      AS modelName,
        m.category  AS category,
        COUNT(d.id) AS deviceCount
      FROM models m
      LEFT JOIN devices d ON d.modelId = m.id
      GROUP BY m.id, m.name, m.category
      ORDER BY m.category, m.name
    `);

    // 2. Get all devices (for the drill-down)
    const [devices] = await pool.query(`
      SELECT
        d.id, d.modelId, d.serial, d.prNumber, d.status,
        d.department, d.addedBy, d.createdAt, d.removedAt,
        d.reason, d.destination, d.deliveredBy, d.kit_id,
        m.name AS modelName, m.category
      FROM devices d
      LEFT JOIN models m ON d.modelId = m.id
      ORDER BY d.createdAt DESC
    `);

    // 3. Map devices into their model buckets
    const devicesByModel = {};
    for (const dev of devices) {
      if (!devicesByModel[dev.modelId]) devicesByModel[dev.modelId] = [];
      devicesByModel[dev.modelId].push(dev);
    }

    // 4. Group models into categories
    const categoryMap = {};
    for (const m of models) {
      const cat = m.category || 'Other';
      if (!categoryMap[cat]) {
        categoryMap[cat] = { category: cat, deviceCount: 0, models: [] };
      }
      const modelEntry = {
        modelId:     m.modelId,
        modelName:   m.modelName,
        deviceCount: Number(m.deviceCount),
        devices:     devicesByModel[m.modelId] || [],
      };
      categoryMap[cat].deviceCount += modelEntry.deviceCount;
      categoryMap[cat].models.push(modelEntry);
    }

    // Sort categories by device count descending
    const categories = Object.values(categoryMap)
      .sort((a, b) => b.deviceCount - a.deviceCount);

    res.json({ categories });
  } catch (e) {
    console.error('Stats error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
