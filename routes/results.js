'use strict';

const express = require('express');
const db = require('../database/db');

const router = express.Router();

router.post('/check', (req, res) => {
  const pin = (req.body.pin || '').trim();
  if (!pin) return res.status(400).json({ error: 'PIN is required' });

  const result = db.checkPin(pin);
  if (!result) {
    return res.status(404).json({ error: 'No result found for this PIN. Check the PIN and try again.' });
  }

  res.json(result);
});

module.exports = router;
