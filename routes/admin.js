'use strict';

const express = require('express');
const multer  = require('multer');
const { parse } = require('csv-parse/sync');
const XLSX    = require('xlsx');
const { createWorker } = require('tesseract.js');
const fs   = require('fs');
const path = require('path');
const db   = require('../database/db');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '../uploads');
const IMAGES_DIR  = path.join(UPLOADS_DIR, 'images');
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ── Parsers ──────────────────────────────────────────────────────────────────

function normalizeRecords(records) {
  return records.map(row => {
    const n = {};
    for (const key of Object.keys(row)) {
      n[key.toLowerCase().replace(/\s+/g, '_')] = String(row[key] ?? '').trim();
    }
    return n;
  });
}

function parseCsvContent(content) {
  const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  return normalizeRecords(records);
}

function parseExcel(filePath) {
  const wb      = XLSX.readFile(filePath);
  const ws      = wb.Sheets[wb.SheetNames[0]];
  const records = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return normalizeRecords(records);
}

// Best-effort OCR text → rows
function parseOcrText(text) {
  const rows  = [];
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3 && !/^[-=_*]+$/.test(l));

  for (const line of lines) {
    // Split on 2+ spaces or tabs
    const tokens = line.split(/\t|\s{2,}/).map(t => t.trim()).filter(Boolean);
    if (tokens.length < 3) continue;

    // Skip obvious header lines
    if (/^(s\/n|no\.?|sn|serial|name|student|subject|score|grade|remark)$/i.test(tokens[0])) continue;

    // Look for a numeric score token
    const scoreIdx = tokens.findIndex(t => /^\d{1,3}(\.\d+)?$/.test(t));
    if (scoreIdx >= 2) {
      rows.push({
        student_name: tokens[0],
        subject:      tokens[scoreIdx - 1] || tokens[1],
        score:        tokens[scoreIdx]     || '',
        grade:        tokens[scoreIdx + 1] || '',
        remark:       tokens[scoreIdx + 2] || '',
      });
    } else if (tokens.length >= 3) {
      rows.push({
        student_name: tokens[0],
        subject:      tokens[1],
        score:        tokens[2] || '',
        grade:        tokens[3] || '',
        remark:       tokens[4] || '',
      });
    }
  }
  return rows;
}

// ── Auto-PIN generation ───────────────────────────────────────────────────────

function autoPins(rows) {
  const year   = new Date().getFullYear();
  const prefix = `EX${year}`;

  const existingPins = db.getAllPins();
  let maxSeq = 0;
  for (const pin of existingPins) {
    if (pin.startsWith(prefix)) {
      const seq = parseInt(pin.slice(prefix.length), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }

  const pinMap   = {};  // student_name (lowercase) → assigned PIN
  const generated = [];

  for (const row of rows) {
    const existing = (row.pin || '').trim();
    if (existing) {
      row.pin = existing.toUpperCase();
      continue;
    }
    const name = (row.student_name || '').trim().toLowerCase();
    if (!name) continue;

    if (!pinMap[name]) {
      maxSeq++;
      const newPin    = `${prefix}${String(maxSeq).padStart(3, '0')}`;
      pinMap[name]    = newPin;
      generated.push({ pin: newPin, student_name: row.student_name });
    }
    row.pin = pinMap[name];
  }

  return generated;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.admin) });
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Invalid password' });
});

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/batches', requireAuth, (req, res) => {
  res.json(db.getBatches());
});

router.get('/stats', requireAuth, (req, res) => {
  res.json(db.getStats());
});

// Download PIN list for a batch
router.get('/batches/:id/pins', requireAuth, (req, res) => {
  const pins = db.getBatchPins(Number(req.params.id));
  if (!pins.length) return res.status(404).json({ error: 'No PINs found for this batch' });

  const csv = 'PIN,Student_Name\n' +
    pins.map(p => `${p.pin},"${p.student_name.replace(/"/g, '""')}"`).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="pins-batch-${req.params.id}.csv"`);
  res.send(csv);
});

// Upload — CSV / Excel / Image
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext       = path.extname(req.file.originalname).toLowerCase();
  const isImage   = ['.png', '.jpg', '.jpeg'].includes(ext);
  const isExcel   = ['.xlsx', '.xls'].includes(ext);
  const isCsv     = ext === '.csv';

  if (!isImage && !isExcel && !isCsv) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Unsupported file type. Use CSV, Excel (.xlsx), PNG, or JPEG.' });
  }

  let rows      = [];
  let imagePath = null;
  let ocrNote   = null;

  try {
    if (isCsv) {
      const content = fs.readFileSync(req.file.path, 'utf8');
      fs.unlinkSync(req.file.path);
      rows = parseCsvContent(content);

    } else if (isExcel) {
      rows = parseExcel(req.file.path);
      fs.unlinkSync(req.file.path);

    } else {
      // Move image to permanent location
      const imgName = `${Date.now()}${ext}`;
      const imgDest = path.join(IMAGES_DIR, imgName);
      fs.renameSync(req.file.path, imgDest);
      imagePath = `/uploads/images/${imgName}`;

      // OCR
      try {
        const worker = await createWorker('eng');
        const { data: { text } } = await worker.recognize(imgDest);
        await worker.terminate();
        rows    = parseOcrText(text);
        ocrNote = rows.length > 0
          ? `OCR extracted ${rows.length} rows — please verify accuracy.`
          : 'OCR could not extract structured data. Image is saved and will display on student results.';
      } catch (ocrErr) {
        console.error('OCR error:', ocrErr.message);
        ocrNote = 'OCR failed. Image is saved and will display on student results.';
      }
    }

    // Validate required columns (skip if image with no rows)
    if (rows.length > 0) {
      const first = rows[0];
      if (!('student_name' in first) || !('subject' in first)) {
        return res.status(400).json({
          error: 'Missing required columns: Student_Name and Subject must be present.',
        });
      }
    } else if (!imagePath) {
      return res.status(400).json({ error: 'No data found in file.' });
    }

    const batchName = (req.body.batch_name || '').trim() ||
      `Upload — ${new Date().toLocaleDateString('en-NG')}`;

    const normalized = rows.map(row => ({
      pin:          (row.pin || '').toUpperCase(),
      student_name: row.student_name || '',
      school:       row.school       || '',
      class:        row.class        || '',
      term:         row.term         || '',
      year:         row.year         || '',
      subject:      row.subject      || '',
      score:        row.score        || '',
      grade:        row.grade        || '',
      remark:       row.remark       || '',
    }));

    const generated = autoPins(normalized);

    const result = db.insertBatch(batchName, normalized, imagePath);

    res.json({
      success:        true,
      inserted:       result.count,
      batch_id:       result.id,
      image_attached: !!imagePath,
      pins_generated: generated,
      ocr_note:       ocrNote,
    });

  } catch (err) {
    try { if (req.file) fs.unlinkSync(req.file.path); } catch {}
    console.error(err);
    res.status(500).json({ error: 'Processing error: ' + err.message });
  }
});

// Manual entry — one student at a time
router.post('/entry', requireAuth, (req, res) => {
  const { batch_name, student_name, school, class: cls, term, year, pin, subjects } = req.body;

  if (!student_name || !student_name.trim()) {
    return res.status(400).json({ error: 'Student name is required' });
  }
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return res.status(400).json({ error: 'At least one subject is required' });
  }

  const rows = subjects
    .filter(s => s.subject && s.subject.trim())
    .map(s => ({
      pin:          (pin || '').trim().toUpperCase(),
      student_name: student_name.trim(),
      school:       (school || '').trim(),
      class:        (cls    || '').trim(),
      term:         (term   || '').trim(),
      year:         (year   || '').trim(),
      subject:      s.subject.trim(),
      score:        (s.score  || '').trim(),
      grade:        (s.grade  || '').trim(),
      remark:       (s.remark || '').trim(),
    }));

  if (rows.length === 0) {
    return res.status(400).json({ error: 'No valid subjects provided' });
  }

  const generated = autoPins(rows);

  const name   = (batch_name || '').trim() || `Manual Entry — ${new Date().toLocaleDateString('en-NG')}`;
  const result = db.insertBatch(name, rows, null);

  res.json({
    success:        true,
    inserted:       result.count,
    batch_id:       result.id,
    pins_generated: generated,
  });
});

router.delete('/batches/:id', requireAuth, (req, res) => {
  db.deleteBatch(Number(req.params.id));
  res.json({ success: true });
});

module.exports = router;
