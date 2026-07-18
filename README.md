# Wearable Intelligence Dashboard

A full-stack real-time system that streams simulated wearable sensor data, runs ML anomaly detection on every reading, and generates AI clinical insights token-by-token via a streaming LLM API. Built with MERN + Python.

---

## How to Start

Open 3 separate terminals:

```bash
# Terminal 1 — ML Service (Python)
cd luna_Board/ml-service
.\venv\Scripts\python main.py

# Terminal 2 — Backend (Node.js)
cd luna_Board/backend
node server.js

# Terminal 3 — Frontend (React)
cd luna_Board/frontend
npm run dev
```

Open: **http://localhost:5173**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, Recharts, Framer Motion |
| Backend | Node.js, Express, ws (WebSocket), Mongoose |
| ML Service | Python, FastAPI, scikit-learn (Isolation Forest) |
| Database | MongoDB Atlas |
| LLM | Groq API (`llama-3.1-8b-instant`), streamed via SSE |
| Styling | Vanilla CSS (dark theme, Inter font) |

---

## Feature List

### 1. Real-Time Sensor Streaming
- Simulated wearable device (WEAR-001) emits readings every 200ms
- Three metrics: Heart Rate (bpm), SpO2 (%), Accelerometer (X/Y/Z + magnitude)
- Data uses Gaussian noise to simulate realistic sensor variance
- 4 randomly injected anomaly types: TACHYCARDIA, BRADYCARDIA, SPO2_DESATURATION, HIGH_MOTION

### 2. Concurrent WebSocket Connections
- Any number of browser tabs can connect simultaneously
- Each client is tracked in a `Map<clientId, ws>` — dead sockets are pruned automatically
- One sensor loop feeds all connected clients via a single broadcast call
- No data loss if a client reconnects — auto-reconnect with 3s delay

### 3. ML Anomaly Detection (Isolation Forest)
- Every sensor reading is sent to the Python FastAPI service via HTTP POST
- Isolation Forest learns the normal distribution of the sensor data
- Warm-up phase: collects 50 readings before making any predictions (shows "Calibrating..." in UI)
- Online adaptation: re-trains every 100 readings on a rolling buffer of 200
- Returns: `{ anomaly: bool, confidence: float 0–1, status: "calibrating"|"active" }`
- Only readings with `status=active` AND `confidence >= 0.65` trigger an alert

### 4. Streaming LLM Insights (Token-by-Token)
- On each confirmed anomaly, the backend sends a clinical prompt to Groq
- Response streams token by token via Server-Sent Events (SSE)
- Frontend opens an `EventSource` and appends each token to the UI in real time
- Blinking cursor shown while streaming is active
- Rate-limited: only one LLM stream runs at a time (concurrent anomalies are skipped in LLM panel but still shown in Alert Feed)
- Full insight text saved to MongoDB after stream completes

### 5. Animated Charts
- Three real-time Recharts `AreaChart` components: Heart Rate, SpO2, Accel Magnitude
- Rolling window of last 60 readings shown at any time
- Gradient fill per metric (red / cyan / purple)
- Reference lines show clinical thresholds: HR High=100, HR Low=60, SpO2 Min=95%, Accel High Motion=2G
- Animation disabled (`isAnimationActive={false}`) for streaming performance

### 6. Alert Feed
- Every confirmed anomaly slides into the feed with Framer Motion animation
- Shows: anomaly type, timestamp, HR value, SpO2 value, confidence badge
- Confidence badge color: Red >= 80%, Orange >= 50%, Yellow < 50%
- Keeps last 20 in-session alerts

### 7. Confidence Gauge
- Recharts `RadialBarChart` showing the confidence of the most recent anomaly
- Color shifts: yellow → orange → red with confidence level
- Updates on every new anomaly event

### 8. Event History Table
- Shows all anomaly events: timestamp, type, HR, SpO2, confidence
- Merges in-session events (WebSocket) with persisted history from MongoDB
- DB history loaded automatically on page load
- Sortable by most recent first

### 9. MongoDB Persistence
- Every confirmed anomaly saved: timestamp, device ID, all metrics, confidence, raw score, anomaly type
- LLM insight text saved back to the same record after stream completes
- History retrieved via GET /api/anomaly/history (up to 50 most recent)

### 10. Live Status Indicators
- Green/red dot in header shows WebSocket connection state
- "Calibrating ML model..." badge shown while model is in warm-up phase
- Live metric cards update every 200ms: current HR, SpO2, Accel Magnitude, total anomaly count

---

## Code Structure

```
luna_Board/
├── backend/                    Node.js + Express + WebSocket server
│   ├── server.js               Main entry point. Creates HTTP+WS server, runs sensor loop,
│   │                           calls ML service, broadcasts anomalies, saves to MongoDB.
│   ├── simulator.js            Generates sensor readings using Gaussian noise.
│   │                           Randomly injects 1 of 4 anomaly types at ~4% rate.
│   ├── wsManager.js            Tracks all WebSocket clients in a Map.
│   │                           Provides broadcast() and addClient() functions.
│   ├── db.js                   Connects to MongoDB Atlas. Graceful fallback if unavailable.
│   ├── llmStream.js            Calls Groq API with a clinical prompt. Streams tokens
│   │                           token-by-token to the HTTP response using SSE.
│   ├── models/
│   │   └── AnomalyEvent.js     Mongoose schema: timestamp, device, metrics,
│   │                           confidence, rawScore, anomalyType, llmInsight.
│   ├── routes/
│   │   ├── anomaly.js          GET /api/anomaly/history — last 50 events from MongoDB.
│   │   │                       POST /api/anomaly/save — attaches LLM insight to a record.
│   │   └── stream.js           GET /api/stream/llm-stream — SSE endpoint.
│   │                           Parses anomaly data from query param, delegates to llmStream.js.
│   ├── .env                    MongoDB URI, Groq API key, model name, sensor interval
│   ├── package.json            Dependencies: express, ws, mongoose, openai, axios, cors, uuid
│   └── test-connections.js     One-time utility to verify MongoDB + Groq connections.
│
├── ml-service/                 Python FastAPI anomaly detection service
│   ├── main.py                 FastAPI app. Endpoints: POST /detect, GET /health, GET /stats.
│   │                           Imports the singleton AnomalyDetector from detector.py.
│   ├── detector.py             AnomalyDetector class using Isolation Forest.
│   │                           Maintains a rolling deque buffer.
│   │                           Fits model after 50 readings, re-trains every 100.
│   │                           Returns anomaly flag + normalized confidence score.
│   ├── requirements.txt        fastapi, uvicorn, scikit-learn, numpy, pydantic, python-dotenv
│   ├── .env                    ML_PORT, CONTAMINATION, WARMUP_SAMPLES, BUFFER_SIZE
│   └── venv/                   Python virtual environment (not committed to git)
│
├── frontend/                   React + Vite application
│   ├── src/
│   │   ├── main.jsx            React entry point. Mounts App into #root.
│   │   ├── App.jsx             Root component. Orchestrates all data flow.
│   │   │                       Loads DB history on mount. Passes data to components.
│   │   ├── style.css           All CSS. Dark theme, Inter font, every component style.
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js Manages WebSocket connection to backend.
│   │   │   │                   Maintains rolling chart arrays (last 60 points).
│   │   │   │                   Emits SENSOR_DATA and ANOMALY_DETECTED events.
│   │   │   │                   Auto-reconnects on disconnect.
│   │   │   └── useLLMStream.js Opens EventSource to /api/stream/llm-stream.
│   │   │                       Appends tokens one by one to insight string.
│   │   │                       Rate-limited: skips if stream already active.
│   │   │                       Saves full insight to MongoDB on stream completion.
│   │   ├── components/
│   │   │   ├── SensorChart.jsx Recharts AreaChart for one metric (HR/SpO2/Accel).
│   │   │   │                   Gradient fill, reference lines, animation disabled.
│   │   │   ├── AlertFeed.jsx   Framer Motion slide-in list of anomaly alerts.
│   │   │   │                   Color-coded confidence badges.
│   │   │   ├── LLMInsightPanel.jsx  Renders the streaming LLM text.
│   │   │   │                        Blinking cursor while streaming is active.
│   │   │   ├── ConfidenceGauge.jsx  Radial bar gauge for anomaly confidence.
│   │   │   │                        Color shifts based on confidence level.
│   │   │   └── TimestampHistory.jsx Table of all anomaly events.
│   │   │                            Merges in-session + MongoDB history.
│   │   └── services/
│   │       └── api.js          Axios instance with VITE_API_URL as baseURL.
│   ├── .env                    VITE_WS_URL, VITE_API_URL, VITE_CHART_WINDOW
│   └── index.html              HTML shell with title and description meta tags.
│
├── .gitignore                  Excludes node_modules, venv, .env files, dist/
└── STATUS.md                   Implementation status, bugs, pipeline diagram
```

---

## Data Flow (Full End-to-End)

```
1. simulator.js generates a reading every 200ms

2. server.js broadcasts it via WebSocket:
   { type: "SENSOR_DATA", payload: { heartRate, spo2, accelerometer, ... } }

3. server.js POSTs the reading to Python FastAPI /detect (timeout: 500ms)

4. detector.py runs Isolation Forest and returns:
   { anomaly: bool, confidence: float, status: "calibrating"|"active" }

5. If anomaly=true AND status=active AND confidence >= 0.65:
   a. Save to MongoDB → get _id
   b. Broadcast via WebSocket:
      { type: "ANOMALY_DETECTED", payload: { reading, confidence, dbId, ... } }

6. useWebSocket.js in React receives ANOMALY_DETECTED:
   - Adds event to anomalyEvents[] state
   - App.jsx passes anomalyEvents[0] as latestAnomaly to LLMInsightPanel

7. LLMInsightPanel passes latestAnomaly to useLLMStream hook

8. useLLMStream opens EventSource:
   GET /api/stream/llm-stream?data=<encoded anomaly JSON>

9. routes/stream.js → llmStream.js:
   - Builds a 2-sentence clinical prompt
   - Calls Groq API with stream: true
   - Writes SSE events: data: {"token":"The"}\n\n ...

10. useLLMStream.onmessage appends each token:
    insight += token   →   LLMInsightPanel renders it live

11. On { done: true }, useLLMStream:
    - Closes EventSource
    - POSTs full insight to /api/anomaly/save with the dbId

12. MongoDB record updated with the complete LLM insight text
```

---

## API Reference

### WebSocket — ws://localhost:5000

| Message Type | Direction | Payload |
|---|---|---|
| `CONNECTED` | Server → Client | `{ clientId, message, timestamp }` |
| `SENSOR_DATA` | Server → Client | `{ id, timestamp, deviceId, heartRate, spo2, accelerometer, accelMagnitude }` |
| `ANOMALY_DETECTED` | Server → Client | `{ reading, confidence, status, timestamp, dbId }` |

### REST — http://localhost:5000

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Server status, connected clients, uptime |
| GET | `/api/anomaly/history?limit=50` | Last N anomaly events from MongoDB |
| POST | `/api/anomaly/save` | Body: `{ anomalyId, llmInsight }` — saves insight to record |
| GET | `/api/stream/llm-stream?data=<json>` | SSE stream of LLM tokens |

### ML Service — http://localhost:8000

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Service info, model status |
| GET | `/health` | Model fitted status, samples seen, buffer size |
| POST | `/detect` | Body: full sensor reading JSON. Returns anomaly result. |
| GET | `/stats` | Detailed detector statistics |

---

## Initial Requirements vs Implementation Status

| Requirement | Status | Notes |
|---|---|---|
| Stream simulated wearable sensor data (HR, SpO2, Accelerometer) over WebSocket | Done | 200ms interval, Gaussian noise, 4 anomaly types |
| ML model evaluates stream continuously for anomalies | Done | Isolation Forest, every reading checked, post-warmup only |
| On each detection, streaming LLM API call triggered | Done | Groq API, SSE, one at a time rate-limited |
| Generated insight rendered live on React dashboard (token-by-token) | Done | useLLMStream hook, blinking cursor |
| Full-response buffering is NOT acceptable | Done | Each token written to SSE immediately, no buffering |
| Real-time animated charts for each metric | Done | Recharts AreaChart, 60-point rolling window, gradient fill |
| Live alert feed | Done | Framer Motion slide-in, color-coded, shows HR/SpO2/type |
| Anomaly confidence scores displayed | Done | Badge on alert, radial gauge, shown in history table |
| Timestamp history for every triggered event | Done | Table with time, type, metrics, confidence — merged with DB |
| Backend handles concurrent WebSocket connections without data loss | Done | Map-based registry, dead socket pruning, broadcast to all |
| LLM response streams token-by-token (no full-response buffering) | Done | SSE with immediate writes per token |
