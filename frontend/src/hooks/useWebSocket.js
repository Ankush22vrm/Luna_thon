import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5000';
const CHART_WINDOW = parseInt(import.meta.env.VITE_CHART_WINDOW || '60', 10);

export function useWebSocket() {
  const [connected, setConnected]       = useState(false);
  const [calibrating, setCalibrating]   = useState(true);
  const [latestReading, setLatestReading] = useState(null);
  const [anomalyEvents, setAnomalyEvents] = useState([]);

  // Rolling chart history for all 4 metrics
  const [sensorHistory, setSensorHistory] = useState({
    heartRate:      [],
    spo2:           [],
    accelMagnitude: [],
    accelX:         [],
  });

  const wsRef = useRef(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected - retrying in 3s');
      setConnected(false);
      setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'SENSOR_DATA') {
          const r = msg.payload;
          setLatestReading(r);

          setSensorHistory((prev) => {
            const append = (arr, value) => {
              const next = [...arr, { time: r.timestamp, value }];
              return next.length > CHART_WINDOW ? next.slice(-CHART_WINDOW) : next;
            };
            return {
              heartRate:      append(prev.heartRate,      r.heartRate),
              spo2:           append(prev.spo2,           r.spo2),
              accelMagnitude: append(prev.accelMagnitude, r.accelMagnitude),
              accelX:         append(prev.accelX,         r.accelerometer?.x ?? 0),
            };
          });
        }

        if (msg.type === 'ANOMALY_DETECTED') {
          const dbId = msg.payload.dbId || null;

          // Use dbId as the stable event id — same anomaly always gets the same key.
          // Falls back to UUID only if DB save failed (dbId is null).
          const eventId = dbId || crypto.randomUUID();

          const newEvent = {
            id:         eventId,
            dbId:       dbId,
            timestamp:  msg.payload.timestamp,
            confidence: msg.payload.confidence,
            reading:    msg.payload.reading,
            llmInsight: '',
          };

          setAnomalyEvents((prev) => {
            // Dedup guard: skip if this exact event id is already tracked
            if (prev.some((e) => e.id === eventId)) return prev;
            return [newEvent, ...prev].slice(0, 50);
          });
          setCalibrating(false);
        }

        if (msg.type === 'CONNECTED') {
          console.log('Server handshake:', msg.message);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  // Called by the LLM panel when streaming finishes — stores insight on the event
  const attachInsight = useCallback((eventId, insight) => {
    setAnomalyEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, llmInsight: insight } : e))
    );
  }, []);

  return { connected, calibrating, latestReading, sensorHistory, anomalyEvents, attachInsight };
}
