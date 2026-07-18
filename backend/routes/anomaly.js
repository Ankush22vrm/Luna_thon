const express = require('express');
const router = express.Router();
const AnomalyEvent = require('../models/AnomalyEvent');

// POST /api/anomaly/save
// Called by the frontend after the LLM insight is fully streamed,
// to attach the generated insight text to the anomaly record in MongoDB
router.post('/save', async (req, res) => {
  try {
    const { anomalyId, llmInsight } = req.body;

    if (!anomalyId || !llmInsight) {
      return res.status(400).json({ error: 'anomalyId and llmInsight are required' });
    }

    const updated = await AnomalyEvent.findByIdAndUpdate(
      anomalyId,
      { llmInsight },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Anomaly event not found' });
    }

    res.json({ success: true, event: updated });
  } catch (err) {
    console.error('Error saving LLM insight:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/anomaly/history
// Returns the last 50 anomaly events sorted by most recent
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const events = await AnomalyEvent.find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, count: events.length, events });
  } catch (err) {
    console.error('Error fetching anomaly history:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
