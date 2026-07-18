require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');

const connectDB = require('./db');
const { generateReading } = require('./simulator');
const { addClient, broadcast, getClientCount } = require('./wsManager');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/anomaly', require('./routes/anomaly'));
app.use('/api/stream', require('./routes/stream'));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connectedClients: getClientCount(),
    uptime: process.uptime().toFixed(1) + 's',
    timestamp: new Date().toISOString(),
  });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection from', req.socket.remoteAddress);
  addClient(ws);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      console.log('Client message received:', msg.type || msg);
    } catch {
      console.warn('Received non-JSON WebSocket message');
    }
  });
});

const INTERVAL_MS = parseInt(process.env.SENSOR_INTERVAL_MS || '200', 10);
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// Minimum confidence for a detection to count as a real anomaly
const ANOMALY_CONFIDENCE_THRESHOLD = 0.65;

// Minimum gap between two anomaly broadcasts in milliseconds.
// Sensor data still streams every 200ms for live charts — only anomaly
// events are suppressed during the cooldown window.
const ANOMALY_COOLDOWN_MS = parseInt(process.env.ANOMALY_COOLDOWN_MS || '10000', 10);

async function checkAnomaly(reading) {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/detect`, reading, {
      timeout: 500,
    });
    return response.data;
  } catch (err) {
    return null;
  }
}

// Maximum anomaly records to keep in MongoDB.
// After each save, older records beyond this limit are deleted automatically.
const MAX_HISTORY = parseInt(process.env.MAX_ANOMALY_HISTORY || '100', 10);

// Saves anomaly to MongoDB and returns the _id string.
// Called before broadcast so dbId is available in the WS payload.
async function saveAnomalyEvent(reading, mlResult) {
  const AnomalyEvent = require('./models/AnomalyEvent');

  // Save the new record
  const doc = await AnomalyEvent.create({
    timestamp: new Date(reading.timestamp),
    deviceId: reading.deviceId,
    metrics: {
      heartRate: reading.heartRate,
      spo2: reading.spo2,
      accelerometer: reading.accelerometer,
      accelMagnitude: reading.accelMagnitude,
    },
    confidence: mlResult.confidence,
    rawScore: mlResult.raw_score,
    anomalyType: reading._anomalyType || 'UNKNOWN',
  });

  // Trim: if total count exceeds MAX_HISTORY, delete the oldest records
  const total = await AnomalyEvent.countDocuments();
  if (total > MAX_HISTORY) {
    const excess = total - MAX_HISTORY;
    // Find the oldest `excess` records and delete them
    const oldest = await AnomalyEvent
      .find({}, { _id: 1 })
      .sort({ timestamp: 1 })
      .limit(excess)
      .lean();
    const idsToDelete = oldest.map((r) => r._id);
    await AnomalyEvent.deleteMany({ _id: { $in: idsToDelete } });
    console.log(`History trimmed - deleted ${excess} old record(s), keeping last ${MAX_HISTORY}`);
  }

  return doc._id.toString();
}


function startSensorStream() {
  console.log(`Sensor stream started - interval: ${INTERVAL_MS}ms | anomaly cooldown: ${ANOMALY_COOLDOWN_MS}ms`);

  let lastAnomalyAt = 0;

  setInterval(async () => {
    const reading = generateReading();

    // Always broadcast raw sensor data — powers the live charts
    broadcast({ type: 'SENSOR_DATA', payload: reading });

    // Ask the ML service whether this reading is anomalous
    const mlResult = await checkAnomaly(reading);

    const isValidAnomaly =
      mlResult &&
      mlResult.anomaly === true &&
      mlResult.status === 'active' &&
      mlResult.confidence >= ANOMALY_CONFIDENCE_THRESHOLD;

    if (!isValidAnomaly) return;

    // Cooldown gate — in real wearable systems anomalies don't fire every tick.
    // Suppress until at least ANOMALY_COOLDOWN_MS has elapsed since the last one.
    const now = Date.now();
    const msSinceLast = now - lastAnomalyAt;
    if (msSinceLast < ANOMALY_COOLDOWN_MS) {
      const remaining = ((ANOMALY_COOLDOWN_MS - msSinceLast) / 1000).toFixed(1);
      console.log(`Anomaly suppressed - cooldown active (${remaining}s remaining)`);
      return;
    }
    lastAnomalyAt = now;

    console.log(
      `Anomaly - type: ${reading._anomalyType} | confidence: ${mlResult.confidence} | HR: ${reading.heartRate} | SpO2: ${reading.spo2}`
    );

    // Save to MongoDB before broadcasting so the dbId is ready
    let dbId = null;
    try {
      dbId = await saveAnomalyEvent(reading, mlResult);
      console.log(`Anomaly saved to DB with id: ${dbId}`);
    } catch (err) {
      console.error('Failed to save anomaly event:', err.message);
    }

    broadcast({
      type: 'ANOMALY_DETECTED',
      payload: {
        reading,
        confidence: mlResult.confidence,
        status:     mlResult.status,
        timestamp:  now,
        dbId,
      },
    });
  }, INTERVAL_MS);
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket ready on ws://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  await connectDB();
  startSensorStream();
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

module.exports = { app, server };
