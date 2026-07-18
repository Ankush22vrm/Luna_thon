import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useLLMStream } from './hooks/useLLMStream';
import SensorChart from './components/SensorChart';
import ActiveEventPanel from './components/ActiveEventPanel';
import EventHistory from './components/EventHistory';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// After LLM typewriter finishes, keep the event visible for this long
// before auto-moving it to history. Configurable via VITE_DISPLAY_AFTER_LLM_MS.
const DISPLAY_AFTER_LLM_MS = parseInt(import.meta.env.VITE_DISPLAY_AFTER_LLM_MS || '10000', 10);

export default function App() {
  const { connected, calibrating, latestReading, sensorHistory, anomalyEvents } =
    useWebSocket();

  // ── Queue state ─────────────────────────────────────────────────────────
  // pendingQueue  : anomalies waiting for their turn (FIFO)
  // activeEvent   : the ONE anomaly currently being shown + LLM-processed
  // historyEvents : anomalies that have fully completed and moved out
  const [pendingQueue,  setPendingQueue]  = useState([]);
  const [activeEvent,   setActiveEvent]   = useState(null);
  const [historyEvents, setHistoryEvents] = useState([]);

  // DB history (previous sessions)
  const [dbHistory, setDbHistory] = useState([]);

  const lastSeenIdRef  = useRef(null);   // ID of the last WS event we enqueued
  const autoMoveTimer  = useRef(null);   // 30s timer after LLM finishes
  const activeEventRef = useRef(null);   // mirror of activeEvent for use in callbacks

  // Keep ref in sync so callbacks always see latest activeEvent
  useEffect(() => { activeEventRef.current = activeEvent; }, [activeEvent]);

  // ── Load DB history on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/anomaly/history?limit=50`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) return;
        const norm = data.events.map((e) => ({
          id:          e._id,
          dbId:        e._id,
          timestamp:   new Date(e.timestamp).getTime(),
          confidence:  e.confidence,
          llmInsight:  e.llmInsight || '',
          reading: {
            heartRate:      e.metrics?.heartRate,
            spo2:           e.metrics?.spo2,
            accelerometer:  e.metrics?.accelerometer,
            accelMagnitude: e.metrics?.accelMagnitude,
            _anomalyType:   e.anomalyType,
          },
        }));
        setDbHistory(norm);
      })
      .catch((err) => console.error('Failed to load DB history:', err.message));
  }, []);

  // STEP 1: New anomaly from WS → push to queue (with dedup)
  useEffect(() => {
    if (anomalyEvents.length === 0) return;

    const newOnes = [];
    for (const event of anomalyEvents) {
      if (event.id === lastSeenIdRef.current) break;
      newOnes.push(event);
    }
    if (newOnes.length === 0) return;

    lastSeenIdRef.current = anomalyEvents[0].id;

    // Dedup guard: skip any event already in the queue or currently active
    setPendingQueue((prev) => {
      const existingIds = new Set(prev.map((e) => e.id));
      if (activeEventRef.current) existingIds.add(activeEventRef.current.id);
      const unique = newOnes.reverse().filter((e) => !existingIds.has(e.id));
      if (unique.length === 0) return prev;
      return [...prev, ...unique];
    });
  }, [anomalyEvents]);

  // ── STEP 2: When active slot is free, pop next from queue ────────────────
  useEffect(() => {
    if (activeEvent !== null) return;   // busy — wait
    if (pendingQueue.length === 0) return;

    const next = pendingQueue[0];
    setPendingQueue((prev) => prev.slice(1));
    setActiveEvent(next);
  }, [activeEvent, pendingQueue]);

  // ── STEP 3: LLM typewriter complete → start 30s display timer ───────────
  const onInsightComplete = useCallback((eventId, fullInsight) => {
    // Attach the full insight text to the active event
    setActiveEvent((prev) =>
      prev?.id === eventId ? { ...prev, llmInsight: fullInsight } : prev
    );

    // After 30s, move to history and free the slot → triggers STEP 2
    if (autoMoveTimer.current) clearTimeout(autoMoveTimer.current);
    autoMoveTimer.current = setTimeout(() => {
      setActiveEvent((prev) => {
        if (prev?.id === eventId) {
          // Push completed event to history
          setHistoryEvents((h) =>
            [{ ...prev, llmInsight: fullInsight }, ...h].slice(0, 100)
          );
          return null; // free the slot
        }
        return prev;
      });
    }, DISPLAY_AFTER_LLM_MS);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (autoMoveTimer.current) clearTimeout(autoMoveTimer.current);
  }, []);

  // ── LLM stream (runs only for activeEvent, one at a time) ────────────────
  const { insight, streaming } = useLLMStream(activeEvent, onInsightComplete);

  // Merge in-session history with DB history — no duplicates.
  // An in-session event can match a DB record by either its own id OR its dbId.
  const seenIds = new Set();
  historyEvents.forEach((e) => {
    if (e.id)   seenIds.add(e.id);
    if (e.dbId) seenIds.add(e.dbId);
  });
  const allHistory = [
    ...historyEvents,
    ...dbHistory.filter((d) => !seenIds.has(d.id) && !seenIds.has(d.dbId)),
  ];

  return (
    <div className="app">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">Wearable Intelligence Dashboard</h1>
          <span className="app-sub">
            Simulated wearable sensor stream · ML anomaly detection · AI reasoning
          </span>
        </div>
        <div className="header-right">
          <span className={`status-dot ${connected ? 'live' : 'offline'}`} />
          <span className="status-label">{connected ? 'Live' : 'Offline'}</span>
          {calibrating && connected && (
            <span className="calibrating-pill">ML Calibrating...</span>
          )}
        </div>
      </header>

      <main className="app-main">

        {/* ── SECTION 1: Live Sensor Data ────────────────────────────── */}
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Live Sensor Data</h2>
            <span className="section-sub">
              Simulated device WEAR-001 · Gaussian noise · updating every 200ms
            </span>
          </div>

          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Heart Rate</span>
              <span className="metric-val" style={{ color: '#e05c5c' }}>
                {latestReading?.heartRate?.toFixed(1) ?? '--'}
              </span>
              <span className="metric-unit">bpm</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">SpO2</span>
              <span className="metric-val" style={{ color: '#4cc9f0' }}>
                {latestReading?.spo2?.toFixed(1) ?? '--'}
              </span>
              <span className="metric-unit">%</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Accel Magnitude</span>
              <span className="metric-val" style={{ color: '#a78bfa' }}>
                {latestReading?.accelMagnitude?.toFixed(3) ?? '--'}
              </span>
              <span className="metric-unit">G</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Accel X-Axis</span>
              <span className="metric-val" style={{ color: '#34d399' }}>
                {latestReading?.accelerometer?.x?.toFixed(3) ?? '--'}
              </span>
              <span className="metric-unit">G</span>
            </div>
          </div>

          <div className="charts-grid">
            <SensorChart title="Heart Rate"      data={sensorHistory.heartRate}      color="#e05c5c" unit="bpm" refLines={[{ y: 100, label: 'High', color: '#ef4444' }, { y: 60, label: 'Low', color: '#f97316' }]} />
            <SensorChart title="SpO2"            data={sensorHistory.spo2}           color="#4cc9f0" unit="%" refLines={[{ y: 95, label: 'Min Safe', color: '#f97316' }]} />
            <SensorChart title="Accel Magnitude" data={sensorHistory.accelMagnitude} color="#a78bfa" unit="G" refLines={[{ y: 2.0, label: 'High Motion', color: '#ef4444' }]} />
            <SensorChart title="Accel X-Axis"   data={sensorHistory.accelX}          color="#34d399" unit="G" refLines={[{ y: 1.5, label: '+High', color: '#ef4444' }, { y: -1.5, label: '-High', color: '#ef4444' }]} />
          </div>
        </section>

        {/* ── SECTION 2: Anomaly Detection ───────────────────────────── */}
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Anomaly Detection</h2>
            <span className="section-sub">
              {activeEvent
                ? `Processing event at ${new Date(activeEvent.timestamp).toLocaleTimeString('en-US', { hour12: false })}`
                : pendingQueue.length > 0
                ? 'Processing will begin shortly...'
                : 'Monitoring stream — no active anomaly'}
            </span>
            {/* Queue badge — shows how many are waiting */}
            {pendingQueue.length > 0 && (
              <span className="queue-badge">
                {pendingQueue.length} queued
              </span>
            )}
          </div>

          <ActiveEventPanel
            event={activeEvent}
            insight={insight}
            streaming={streaming}
          />

          {/* Pending queue preview — list of what's waiting */}
          {pendingQueue.length > 0 && (
            <div className="queue-preview">
              <span className="queue-preview-label">Waiting in queue:</span>
              <div className="queue-preview-items">
                {pendingQueue.map((e, i) => (
                  <span key={e.id} className="queue-item">
                    {i + 1}. {(e.reading?._anomalyType || 'ANOMALY').replace(/_/g, ' ')}
                    &nbsp;·&nbsp;
                    {(e.confidence * 100).toFixed(0)}%
                    &nbsp;·&nbsp;
                    {new Date(e.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── SECTION 3: Event History ────────────────────────────────── */}
        <EventHistory events={allHistory} />

      </main>
    </div>
  );
}
