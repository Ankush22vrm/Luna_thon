# Luna Board — System Architecture & Developer Reference

## Overview

Luna Board is a full-stack real-time health monitoring dashboard that:

1. Streams simulated wearable sensor data (Heart Rate, SpO2, Accelerometer) over WebSocket
2. Passes every reading through an ML model (Isolation Forest) to detect anomalies
3. When an anomaly is confirmed, queues it and makes a streaming LLM API call for AI reasoning
4. Renders everything live on a React dashboard — charts update every 200ms, LLM text types out character by character

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                        REACT FRONTEND                             │
│                      localhost:5173                               │
│                                                                   │
│   useWebSocket ──────── WebSocket ─────────────────────┐         │
│   useLLMStream ──────── SSE (EventSource) ─────────────┤         │
│                                                         │         │
│   Sections:                                             │         │
│   1. Live Sensor Data (4 metric cards + 4 charts)       │         │
│   2. Anomaly Detection (active event + LLM reasoning)   │         │
│   3. Event History (completed events + AI text)         │         │
└─────────────────────────────────────────────────────────┼─────────┘
                                                          │
                                                          │ WS + HTTP
                                                          │
┌─────────────────────────────────────────────────────────┼─────────┐
│                     NODE.JS BACKEND                     │         │
│                      localhost:5000                               │
│                                                                   │
│   server.js ─── setInterval(200ms)                                │
│       │          ├── generateReading()  ──────────────────────────►│ simulator.js
│       │          ├── broadcast SENSOR_DATA via WS                  │
│       │          ├── POST /detect  ───────────────────────────────►│ ML service
│       │          │   (if anomaly + cooldown elapsed)               │
│       │          ├── saveAnomalyEvent() ──────────────────────────►│ MongoDB
│       │          └── broadcast ANOMALY_DETECTED via WS             │
│       │                                                            │
│   routes/stream.js ─── GET /api/stream/llm-stream (SSE)           │
│       └── llmStream.js ──────────────────────────────────────────►│ Groq API
│                                                                    │
│   routes/anomaly.js                                                │
│       ├── GET  /api/anomaly/history                                │
│       └── POST /api/anomaly/save  (saves LLM insight to record)   │
└────────────────────────────────────────────────────────────────────┘
                          │ POST /detect
                          │
┌─────────────────────────▼──────────────────────────────────────────┐
│                    PYTHON ML SERVICE                                │
│                      localhost:8000                                 │
│                                                                     │
│   main.py ─── FastAPI                                               │
│       ├── POST /detect  ──►  detector.py (IsolationForest)          │
│       │       └── returns { anomaly, confidence, status, raw_score }│
│       └── GET  /health                                              │
│                                                                     │
│   detector.py                                                       │
│       ├── Warmup phase: first 50 readings → collects baseline       │
│       ├── Training: every 200 samples → retrain model               │
│       └── Inference: score each reading, threshold at 0.5           │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       MONGODB ATLAS                                  │
│                   Collection: anomalyevents                          │
│                                                                      │
│   Fields: timestamp, deviceId, metrics{HR,SpO2,accel,magnitude},     │
│           confidence, rawScore, anomalyType, llmInsight              │
│   Cap: last 100 records (oldest auto-deleted on each save)           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow — Step by Step

```
Every 200ms:
  simulator.js generates a reading
       ↓
  Backend broadcasts SENSOR_DATA via WebSocket → charts update
       ↓
  Backend POSTs reading to ML service /detect
       ↓
  ML returns { anomaly: true/false, confidence, status }
       ↓
  If anomaly=true AND confidence>=0.65 AND cooldown elapsed (10s):
       ↓
  Save to MongoDB → get _id (dbId)
       ↓
  Backend broadcasts ANOMALY_DETECTED { reading, confidence, dbId }
       ↓
  Frontend adds event to pendingQueue
       ↓
  If activeEvent slot is empty → pop from queue → set as activeEvent
       ↓
  useLLMStream opens SSE to GET /api/stream/llm-stream?data=...
       ↓
  Backend sends reading context to Groq API
       ↓
  Groq streams tokens → backend pipes them as SSE events
       ↓
  Frontend receives tokens → character queue → one char every 18ms → typewriter
       ↓
  LLM done → onComplete fires → insight saved to MongoDB (POST /api/anomaly/save)
       ↓
  10-second display timer starts
       ↓
  Timer expires → event moves to history
       ↓
  Next event popped from queue (if any) → cycle repeats
```

---

## File Reference

### Backend (`/backend`)

| File | Purpose |
|------|---------|
| `server.js` | Entry point. Creates Express + WebSocket server. Runs the 200ms sensor loop with anomaly cooldown gate. Saves anomalies to DB before broadcasting. |
| `simulator.js` | Generates simulated sensor readings using Gaussian random distribution. Injects anomaly patterns at configurable rate. |
| `llmStream.js` | Opens a streaming connection to the Groq API using the OpenAI SDK. Pipes tokens as SSE `data:` events to the Express response. |
| `wsManager.js` | Tracks all connected WebSocket clients. Provides `broadcast()` and `getClientCount()`. |
| `db.js` | Connects to MongoDB Atlas using Mongoose. Called once on server start. |
| `models/AnomalyEvent.js` | Mongoose schema: timestamp, deviceId, metrics, confidence, rawScore, anomalyType, llmInsight. |
| `routes/anomaly.js` | `GET /history` — returns last N anomalies. `POST /save` — updates a record with llmInsight text. |
| `routes/stream.js` | `GET /llm-stream` — SSE endpoint. Parses anomaly data from query param, calls `llmStream.js`. |
| `controllers/anomalyController.js` | Business logic for anomaly history and insight save. |

### ML Service (`/ml-service`)

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app. Exposes `/detect` and `/health`. Delegates to `detector.py`. |
| `detector.py` | Implements the Isolation Forest pipeline. Warmup phase (50 samples), then trains on every 200 samples. Scores each reading against the model. Returns confidence as `1 - (raw_score normalized)`. |

### Frontend (`/frontend/src`)

| File | Purpose |
|------|---------|
| `main.jsx` | React entry point. No StrictMode (intentional — prevents double WebSocket connections). |
| `App.jsx` | Root component. Manages the FIFO anomaly queue, active event state, history merge, and LLM lifecycle. Orchestrates all 3 sections. |
| `style.css` | All styling. Dark theme with Inter font, glassmorphism-style cards, responsive grid. |
| `hooks/useWebSocket.js` | Opens and maintains the WebSocket connection to the backend. Parses SENSOR_DATA and ANOMALY_DETECTED messages. Deduplicates events using dbId. Returns `sensorHistory`, `anomalyEvents`, `connected`, `calibrating`. |
| `hooks/useLLMStream.js` | Opens an SSE EventSource to `/api/stream/llm-stream`. Receives tokens, pushes each character into a queue, drains one char every 18ms for typewriter effect. Calls `onComplete` when rendering is done. Saves insight to DB. |
| `components/ActiveEventPanel.jsx` | Shows the currently processing anomaly. Left: event type, confidence bar, metric values at time of event. Right: LLM reasoning text typing out. |
| `components/EventHistory.jsx` | Renders the completed event list. Each card shows type, timestamp, confidence badge, HR/SpO2/Accel values, and the full AI reasoning text. |
| `components/SensorChart.jsx` | Recharts `LineChart` wrapper. Accepts rolling data array, color, unit, and reference lines. Used for all 4 charts. |
| `components/AlertFeed.jsx` | (Legacy — not used in current layout) |
| `components/TimestampHistory.jsx` | (Legacy — replaced by EventHistory) |
| `components/ConfidenceGauge.jsx` | (Legacy — not used in current layout) |
| `components/LLMInsightPanel.jsx` | (Legacy — merged into ActiveEventPanel) |

---

## How to Start the Project

You need **3 terminals** running simultaneously.

### Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB Atlas URI (already set in `backend/.env`)
- Groq API key (already set in `backend/.env`)

### Terminal 1 — ML Service

```bash
cd luna_Board/ml-service
.\venv\Scripts\python main.py        # Windows
# source venv/bin/activate && python main.py  # Mac/Linux
```

Starts on `http://localhost:8000`. Wait for:
```
[ML] Service starting on http://localhost:8000
```

### Terminal 2 — Backend

```bash
cd luna_Board/backend
node server.js
```

Starts on `http://localhost:5000`. Wait for:
```
MongoDB connected: ...
Sensor stream started - interval: 200ms | anomaly cooldown: 10000ms
```

### Terminal 3 — Frontend

```bash
cd luna_Board/frontend
npm run dev
```

Starts on `http://localhost:5173`. Open this URL in your browser.

> The ML model needs ~10 seconds to warm up (50 readings). During this time the "ML Calibrating..." badge is shown and no anomalies are detected.

---

## All Configurables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Node.js server port |
| `MONGO_URI` | *(set)* | MongoDB Atlas connection string |
| `ML_SERVICE_URL` | `http://localhost:8000` | URL of the Python ML service |
| `GROQ_API_KEY` | *(set)* | Groq API key for LLM |
| `GROQ_MODEL` | `llama-3.1-8b-instant` | Groq model to use |
| `SENSOR_INTERVAL_MS` | `200` | How often a sensor reading is generated (ms) |
| `ANOMALY_INJECT_RATE` | `0.04` | Probability of injecting an anomaly per reading (0–1) |
| `ANOMALY_COOLDOWN_MS` | `10000` | Minimum gap between two anomaly broadcasts (ms) |
| `MAX_ANOMALY_HISTORY` | `100` | Maximum anomaly records kept in MongoDB |

### ML Service (`ml-service/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `ML_PORT` | `8000` | FastAPI service port |
| `CONTAMINATION` | `0.05` | IsolationForest contamination parameter (expected anomaly fraction) |
| `WARMUP_SAMPLES` | `50` | Readings collected before model becomes active |
| `RETRAIN_EVERY` | `200` | Retrain the model every N samples |
| `CONFIDENCE_THRESHOLD` | `0.5` | Raw score threshold for classifying as anomaly |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_WS_URL` | `ws://localhost:5000` | WebSocket URL of the backend |
| `VITE_API_URL` | `http://localhost:5000/api` | REST API base URL of the backend |
| `VITE_CHART_WINDOW` | `60` | Number of data points visible on each live chart |
| `VITE_DISPLAY_AFTER_LLM_MS` | `10000` | How long (ms) to show a completed AI insight before moving to history |

---

## Anomaly Categories

| Type | Trigger Condition | Affected Metric |
|------|-------------------|-----------------|
| `TACHYCARDIA` | HR injected at mean=135 bpm (range 120–180) | Heart Rate spikes high |
| `BRADYCARDIA` | HR injected at mean=45 bpm (range 30–55) | Heart Rate dips low |
| `SPO2_DESATURATION` | SpO2 injected at mean=89% (range 82–93%) | SpO2 drops below safe level |
| `HIGH_MOTION` | All accel axes at std=2.5G (vs normal std=0.3G) | Accel magnitude spikes |

The ML model (Isolation Forest) does **not** know these labels — it detects anomalies purely from the numeric values. The `_anomalyType` label is set by the simulator and passed through for display.

---

## Key Design Decisions

| Decision | Reason |
|----------|--------|
| No React StrictMode | StrictMode mounts twice in dev, creating 2 WebSocket connections and doubling every anomaly event |
| dbId as event key | Using MongoDB `_id` as the event identifier instead of `crypto.randomUUID()` ensures the same anomaly always gets the same key even across reconnects |
| Character queue typewriter | LLM tokens arrive too fast to see individually. Characters are queued and drained at 18ms/char to create a visible writing effect |
| FIFO anomaly queue | A new anomaly never interrupts the current one. It waits its turn — each event gets full LLM treatment |
| Cooldown gate in backend | Anomaly rate-limited at the source. Sensor data streams freely; only anomaly broadcasts are gated |
| Save before broadcast | MongoDB save happens before the WebSocket broadcast so `dbId` is available in the payload for the frontend to use immediately |
