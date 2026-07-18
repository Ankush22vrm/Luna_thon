import { motion, AnimatePresence } from 'framer-motion';

function formatDateTime(ts) {
  return new Date(ts).toLocaleString('en-US', { hour12: false });
}

function ConfBadge({ value }) {
  const pct = (value * 100).toFixed(0);
  const bg  = value >= 0.8 ? '#ef4444' : value >= 0.65 ? '#f97316' : '#eab308';
  return <span className="conf-badge" style={{ background: bg }}>{pct}%</span>;
}

function HistoryCard({ event }) {
  const type  = event.reading?._anomalyType || event.anomalyType || 'UNKNOWN';
  const hr    = event.reading?.heartRate?.toFixed(1)  ?? event.metrics?.heartRate?.toFixed(1)  ?? '--';
  const spo2  = event.reading?.spo2?.toFixed(1)       ?? event.metrics?.spo2?.toFixed(1)       ?? '--';
  const mag   = event.reading?.accelMagnitude?.toFixed(3) ?? event.metrics?.accelMagnitude?.toFixed(3) ?? '--';

  return (
    <motion.div
      className="history-card"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="hcard-top">
        <div className="hcard-left">
          <span className="hcard-type">{type.replace(/_/g, ' ')}</span>
          <span className="hcard-time">{formatDateTime(event.timestamp)}</span>
        </div>
        <ConfBadge value={event.confidence} />
      </div>

      <div className="hcard-metrics">
        <span>HR: <b>{hr} bpm</b></span>
        <span>SpO2: <b>{spo2}%</b></span>
        <span>Accel: <b>{mag} G</b></span>
      </div>

      {event.llmInsight && (
        <div className="hcard-insight">
          <span className="hcard-insight-label">AI Reasoning</span>
          <p className="hcard-insight-text">{event.llmInsight}</p>
        </div>
      )}
    </motion.div>
  );
}

export default function EventHistory({ events }) {
  return (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">Event History</h2>
        <span className="section-count">{events.length} events</span>
      </div>
      {events.length === 0 ? (
        <p className="muted-text">No events recorded yet.</p>
      ) : (
        <div className="history-list">
          <AnimatePresence>
            {events.map((e, i) => (
              <HistoryCard key={`hist-${e.id || e._id || i}`} event={e} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
