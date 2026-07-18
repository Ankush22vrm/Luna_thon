const mongoose = require('mongoose');

const anomalyEventSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, required: true },
    deviceId: { type: String, required: true },
    metrics: {
      heartRate: Number,
      spo2: Number,
      accelerometer: {
        x: Number,
        y: Number,
        z: Number,
      },
      accelMagnitude: Number,
    },
    confidence: { type: Number, required: true },
    rawScore: Number,
    anomalyType: { type: String, default: 'UNKNOWN' },
    llmInsight: { type: String, default: '' }, // filled after LLM stream completes
  },
  { timestamps: true }
);

module.exports = mongoose.model('AnomalyEvent', anomalyEventSchema);
