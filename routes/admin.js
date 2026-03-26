'use strict';

const express = require('express');
const multer  = require('multer');
const { parse } = require('csv-parse/sync');
const fs   = require('fs');
const path = require('path');
const db   = require('../database/db');

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '../uploads/') });

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Auth status
router.get('/status', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.admin) });
});

// Login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Invalid password' });
});

// Logout
router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// List batches
router.get('/batches', requireAuth, (req, res) => {
  res.json(db.getBatches());
});

// Stats
router.get('/stats', requireAuth, (req, res) => {
  res.json(db.getStats());
});

// Upload CSV
router.post('/upload', requireAuth, upload.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const content = fs.readFileSync(req.file.path, 'utf8');
    fs.unlinkSync(req.file.path);

    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) return res.status(400).json({ error: 'CSV file is empty' });

    // Normalize headers to lowercase_with_underscores
    const rows = records.map(row => {
      const n = {};
      for (const key of Object.keys(row)) {
        n[key.toLowerCase().replace(/\s+/g, '_')] = row[key];
      }
      return n;
    });

    // Validate required columns
    const first = rows[0];
    for (const col of ['pin', 'student_name', 'subject']) {
      if (!(col in first)) {
        return res.status(400).json({ error: `Missing required column: "${col}"` });
      }
    }

    const batchName = (req.body.batch_name || '').trim() ||
      `Upload — ${new Date().toLocaleDateString('en-NG')}`;

    const normalized = rows.map(row => ({
      pin:          row.pin.toUpperCase(),
      student_name: row.student_name,
      school:       row.school       || '',
      class:        row.class        || '',
      term:         row.term         || '',
      year:         row.year         || '',
      subject:      row.subject,
      score:        row.score        || '',
      grade:        row.grade        || '',
      remark:       row.remark       || '',
    }));

    const result = db.insertBatch(batchName, normalized);
    res.json({ success: true, inserted: result.count, batch_id: result.id });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'CSV parse error: ' + err.message });
  }
});

// Delete batch
router.delete('/batches/:id', requireAuth, (req, res) => {
  db.deleteBatch(Number(req.params.id));
  res.json({ success: true });
});

module.exports = router;
