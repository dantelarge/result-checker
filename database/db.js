'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    return { batches: [], results: [], _nextBatchId: 1, _nextResultId: 1 };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const db = {

  getBatches() {
    const data = load();
    return data.batches.map(b => {
      const rows = data.results.filter(r => r.batch_id === b.id);
      const pins = new Set(rows.map(r => r.pin));
      return {
        ...b,
        student_count: pins.size,
        row_count:     rows.length,
      };
    }).sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
  },

  getStats() {
    const data = load();
    const allPins = new Set(data.results.map(r => r.pin));
    return {
      total_students: allPins.size,
      total_rows:     data.results.length,
      total_batches:  data.batches.length,
    };
  },

  // All unique PINs across the entire database (for auto-PIN sequencing)
  getAllPins() {
    const data = load();
    return [...new Set(data.results.map(r => r.pin))];
  },

  // Unique PIN + name pairs for a single batch (for PIN download)
  getBatchPins(batchId) {
    const data = load();
    const seen = new Set();
    const pins = [];
    for (const r of data.results) {
      if (r.batch_id === batchId && !seen.has(r.pin)) {
        seen.add(r.pin);
        pins.push({ pin: r.pin, student_name: r.student_name });
      }
    }
    return pins;
  },

  insertBatch(name, rows, imagePath = null) {
    const data = load();
    const id   = data._nextBatchId++;

    data.batches.push({
      id,
      name,
      uploaded_at: new Date().toISOString(),
      image_path:  imagePath,
    });

    for (const row of rows) {
      data.results.push({ id: data._nextResultId++, batch_id: id, ...row });
    }

    save(data);
    return { id, count: rows.length };
  },

  deleteBatch(id) {
    const data = load();
    data.batches = data.batches.filter(b => b.id !== id);
    data.results = data.results.filter(r => r.batch_id !== id);
    save(data);
  },

  checkPin(pin) {
    const data = load();
    const rows = data.results.filter(r => r.pin === pin.toUpperCase());
    if (rows.length === 0) return null;

    const batchIds = [...new Set(rows.map(r => r.batch_id))];
    const latestId = batchIds.sort((a, b) => {
      const ba = data.batches.find(x => x.id === a);
      const bb = data.batches.find(x => x.id === b);
      return new Date(bb.uploaded_at) - new Date(ba.uploaded_at);
    })[0];

    const batch     = data.batches.find(b => b.id === latestId);
    const batchRows = rows.filter(r => r.batch_id === latestId)
                         .sort((a, b) => a.subject.localeCompare(b.subject));
    const first     = batchRows[0];

    return {
      batch_name:   batch.name,
      image_url:    batch.image_path || null,
      student_name: first.student_name,
      school:       first.school,
      class:        first.class,
      term:         first.term,
      year:         first.year,
      subjects: batchRows.map(r => ({
        subject: r.subject,
        score:   r.score,
        grade:   r.grade,
        remark:  r.remark,
      })),
    };
  },
};

module.exports = db;
