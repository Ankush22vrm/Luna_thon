# Wearable Intelligence Dashboard — Implementation Status

## What is Done

### Backend (Node.js)

| File | What it does | Status |
|---|---|---|
| `server.js` | Express + WebSocket on same port, sensor loop, ML bridge | Done |
| `simulator.js` | Gaussian noise readings, 4 anomaly types injected randomly | Done |
| `wsManager.js` | Concurrent WS client handling via Map, auto-prunes dead sockets | Done |
| `db.js` | MongoDB Atlas connection with graceful fallback if DB is down | Done |
| `models/AnomalyEvent.js` | Mongoose schema — metrics, confidence, type, llmInsight | Done |
| `routes/anomaly.js` | GET /history, POST /save | Done |
| `routes/stream.js` | SSE /llm-stream endpoint | Done |
| `llmStream.js` | Groq token streaming via openai SDK, writes SSE events | Done |
| Node → ML bridge | Every reading is POSTed to Python /detect | Done |
| ANOMALY_DETECTED broadcast | Sent to all WS clients when ML flags anomaly | Done |
| MongoDB save on anomaly | Non-blocking background write on each anomaly | Done |

### ML Service (Python)

| File | What it does | Status |
|---|---|---|
| `detector.py` | Isolation Forest, rolling buffer of 200 readings | Done |
| `main.py` | FastAPI with /detect, /health, /stats | Done |
| Warm-up phase | Returns `status: calibrating` for first 50 readings | Done |
| Periodic re-train | Model re-fits every 100 readings for online adaptation | Done |
| Confidence score | Normalized 0–1 from Isolation Forest decision function | Done |

### Frontend (React)

| File | What it does | Status |
|---|---|---|
| `hooks/useWebSocket.js` | WS connection, rolling chart history arrays, auto-reconnect | Done |
| `hooks/useLLMStream.js` | EventSource SSE, appends tokens one by one, closes on done | Done |
| `components/SensorChart.jsx` | Recharts AreaChart, gradient fill, reference lines | Done |
| `components/AlertFeed.jsx` | Framer Motion slide-in alerts, confidence color-coded badges | Done |
| `components/LLMInsightPanel.jsx` | Renders streaming tokens with blinking cursor | Done |
| `components/ConfidenceGauge.jsx` | Radial bar gauge, color shifts yellow → orange → red | Done |
| `components/TimestampHistory.jsx` | Table of anomaly events with timestamp, type, HR, SpO2, confidence | Done |
| `App.jsx` | Full layout — header, metric cards, charts, bottom row, history | Done |
| `style.css` | Dark theme, Inter font, all component styles | Done |

---

## ML → LLM → UI Pipeline (the core requirement)

```
[Python FastAPI /detect]
        |
        |  returns { anomaly: true, confidence: 0.72, status: "active" }
        |
[server.js — sensor loop]
        |
        |  broadcasts WebSocket: { type: "ANOMALY_DETECTED", payload: { reading, confidence } }
        |
[useWebSocket.js in React]
        |
        |  adds event to anomalyEvents[], passes anomalyEvents[0] to LLMInsightPanel
        |
[LLMInsightPanel → useLLMStream hook]
        |
        |  opens EventSource: GET /api/stream/llm-stream?data=<anomaly JSON>
        |
[routes/stream.js → llmStream.js]
        |
        |  Groq API called with clinical prompt, stream: true
        |  SSE writes:  data: {"token":"The"}\n\n
        |               data: {"token":" patient"}\n\n  ... token by token
        |
[useLLMStream — onmessage]
        |
        |  appends each token to `insight` string
        |
[LLMInsightPanel renders]
        |
        |  insight string grows character by character
        |  blinking cursor shown while streaming=true
        |
        |  data: {"done":true}  --> stream closes
        |
[MongoDB save of insight]  ← PENDING (blocked by Bug 3 below)
```

**Status: Wired end-to-end. Tokens stream into the UI on every anomaly.**

---

## Bugs (code exists but has issues)

### Bug 1 — LLM stream re-triggers too aggressively
- **File:** `frontend/src/hooks/useLLMStream.js` line 65
- **Problem:** `useEffect` depends on the full `anomalyPayload` object. Since `anomalyEvents[0]` is a new object reference on every React re-render, the SSE stream re-opens more than it should.
- **Fix:** Change dependency from `[anomalyPayload]` to `[anomalyPayload?.id]` so it only fires on a genuinely new anomaly ID.

### Bug 2 — ML flags anomalies during/just after calibration
- **File:** `backend/server.js` line 76
- **Problem:** The model starts detecting after 50 readings, but the early fit can be biased. Logs show normal readings (HR: 78, SpO2: 98) being flagged. The calibration period produces false positives.
- **Fix:** In server.js, only fire ANOMALY_DETECTED when `mlResult.status === 'active'` AND `mlResult.confidence > 0.65`.

### Bug 3 — MongoDB _id not sent to frontend
- **File:** `backend/server.js` — `saveAnomalyEvent()`
- **Problem:** The MongoDB document is saved but its `_id` is never included in the WebSocket broadcast. The POST /api/anomaly/save route requires `anomalyId` from the frontend but the frontend has no way to know it.
- **Fix:** Return the saved doc's `_id` from `saveAnomalyEvent()` and include it in the ANOMALY_DETECTED broadcast payload.

---

## Pending Features (not yet built)

| # | Feature | Effort |
|---|---|---|
| 1 | Load anomaly history from MongoDB on page load | Small — one `useEffect` + GET call in App.jsx |
| 2 | Save LLM insight to MongoDB after stream completes | Small — POST in useLLMStream after `done`, blocked by Bug 3 |
| 3 | LLM rate-limiting — only 1 stream at a time, queue the rest | Medium — flag in useLLMStream or server-side queue |

---

## Fix Order (recommended next steps)

1. Fix Bug 2 in `server.js` — add confidence threshold + status check (5 min)
2. Fix Bug 1 in `useLLMStream.js` — stable dependency (5 min)
3. Fix Bug 3 in `server.js` — pass `_id` in broadcast (5 min)
4. Implement history load from MongoDB on page load (15 min)
5. Implement LLM insight save to MongoDB after stream (10 min)
6. Add LLM rate-limiting — one call at a time (10 min)

---

## How to Start the Project

Open 3 separate terminals:

```bash
# Terminal 1 — ML Service
cd luna_Board/ml-service
.\venv\Scripts\python main.py

# Terminal 2 — Backend
cd luna_Board/backend
node server.js

# Terminal 3 — Frontend
cd luna_Board/frontend
npm run dev
```

Then open: http://localhost:5173
