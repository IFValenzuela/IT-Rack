'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { Ollama } = require('ollama');

const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });

router.get('/analyze-issues', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT notes, transactionType FROM phones WHERE notes IS NOT NULL AND notes != ''"
    );

    let totalIssuesAnalyzed = rows.length;

    if (totalIssuesAnalyzed === 0) {
      return res.json({
        totalIssuesAnalyzed: 0,
        topIssues: [],
        improvements: ['Not enough data. Ensure technicians log detailed notes during returns.']
      });
    }

    // Extract notes text
    const notesText = rows.map(r => r.notes).join(' | ');

    // Prepare prompt
    const prompt = `
You are an IT hardware analyst. I will provide you with a list of notes from returned mobile phones separated by |.
Your job is to read these notes, categorize the hardware or software issues mentioned, count the occurrences, and suggest actionable areas for improvement based on the most frequent issues.
Notes: ${notesText}

Return EXACTLY a JSON object with this exact structure (no markdown, no other text):
{
  "topIssues": [
    { "issueName": "string (e.g. Screen Damage)", "count": number }
  ],
  "improvements": [
    "string (e.g. We should buy rugged cases)"
  ]
}
`;

    const response = await ollama.chat({
      model: 'llama3.2',
      messages: [{ role: 'user', content: prompt }],
      format: 'json',
      stream: false
    });

    let aiData;
    try {
      aiData = JSON.parse(response.message.content);
    } catch (parseErr) {
      console.error('Failed to parse Ollama output:', response.message.content);
      throw new Error('AI returned invalid format.');
    }

    res.json({
      totalIssuesAnalyzed,
      topIssues: aiData.topIssues || [],
      improvements: aiData.improvements || []
    });

  } catch (e) {
    console.error('AI Analysis error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
