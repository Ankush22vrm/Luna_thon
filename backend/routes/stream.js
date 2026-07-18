const express = require('express');
const router = express.Router();
const { streamInsight } = require('../llmStream');

// GET /api/stream/llm-stream?data=<JSON-encoded anomaly data>
//
// This is a Server-Sent Events (SSE) endpoint.
// The frontend opens an EventSource to this URL when an anomaly is detected.
// Tokens are written one by one as they arrive from the Groq API.
//
// Expected query param: data = JSON string with { reading, confidence, anomalyType }
router.get('/llm-stream', async (req, res) => {
  let parsed;

  try {
    parsed = JSON.parse(req.query.data);
  } catch {
    return res.status(400).json({ error: 'Invalid or missing "data" query param. Expected JSON string.' });
  }

  const { reading, confidence, anomalyType } = parsed;

  if (!reading || confidence === undefined) {
    return res.status(400).json({ error: '"reading" and "confidence" are required inside data' });
  }

  // streamInsight takes over the response and writes SSE events until done
  await streamInsight(reading, confidence, anomalyType, res);
});

module.exports = router;
