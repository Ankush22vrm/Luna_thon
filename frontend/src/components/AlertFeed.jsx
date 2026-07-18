import { motion, AnimatePresence } from 'framer-motion';

// Color-codes the alert badge based on confidence level
function getBadgeStyle(confidence) {
  if (confidence >= 0.8) return { background: '#ff2d2d', color: '#fff' };
  if (confidence >= 0.5) return { background: '#ff8c00', color: '#fff' };
  return { background: '#e6c200', color: '#111' };
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

function AlertItem({ event }) {
  const badge = getBadgeStyle(event.confidence);

  return (
    <motion.div
      className="alert-item"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="alert-top">
        <span className="alert-type">{event.reading?._anomalyType || 'ANOMALY'}</span>
        <span className="alert-time">{formatTime(event.timestamp)}</span>
      </div>
      <div className="alert-bottom">
        <span className="alert-label">HR: <b>{event.reading?.heartRate?.toFixed(1)} bpm</b></span>
        <span className="alert-label">SpO2: <b>{event.reading?.spo2?.toFixed(1)}%</b></span>
        <span className="alert-badge" style={badge}>
          {(event.confidence * 100).toFixed(0)}% conf
        </span>
      </div>
    </motion.div>
  );
}

export default function AlertFeed({ events }) {
  return (
    <div className="panel">
      <h3 className="panel-title">Alert Feed</h3>
      {events.length === 0 ? (
        <p className="muted-text">No anomalies detected yet.</p>
      ) : (
        <div className="alert-list">
          <AnimatePresence>
            {events.map((event) => (
              <AlertItem key={event.id} event={event} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
