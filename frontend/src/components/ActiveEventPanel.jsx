function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

// insight and streaming come from App.jsx (useLLMStream lives there)
// so the LLM state is not lost when this component re-renders
export default function ActiveEventPanel({ event, insight, streaming }) {

  if (!event) {
    return (
      <div className="active-event-panel active-event-empty">
        <div className="empty-state">
          <div className="pulse-ring" />
          <span className="empty-title">Monitoring Active</span>
          <span className="empty-sub">
            No anomaly detected yet. The ML model is evaluating the sensor stream continuously.
          </span>
        </div>
      </div>
    );
  }

  const type = (event.reading?._anomalyType || 'ANOMALY').replace(/_/g, ' ');
  const conf = (event.confidence * 100).toFixed(1);
  const hr   = event.reading?.heartRate?.toFixed(1);
  const spo2 = event.reading?.spo2?.toFixed(1);
  const mag  = event.reading?.accelMagnitude?.toFixed(3);
  const fillColor = conf >= 80 ? '#ef4444' : conf >= 65 ? '#f97316' : '#eab308';

  return (
    <div className="active-event-panel">

      {/* Left — event details */}
      <div className="event-details">
        <div className="event-type-row">
          <span className="event-badge">{type}</span>
          <span className="event-time">{formatTime(event.timestamp)}</span>
        </div>

        <div className="event-confidence">
          <span className="conf-label">Confidence Score</span>
          <span className="conf-value">{conf}%</span>
          <div className="conf-bar">
            <div className="conf-fill" style={{ width: `${conf}%`, background: fillColor }} />
          </div>
        </div>

        <div className="event-metrics">
          <div className="event-metric">
            <span className="em-label">Heart Rate</span>
            <span className="em-value" style={{ color: '#e05c5c' }}>{hr} bpm</span>
          </div>
          <div className="event-metric">
            <span className="em-label">SpO2</span>
            <span className="em-value" style={{ color: '#4cc9f0' }}>{spo2}%</span>
          </div>
          <div className="event-metric">
            <span className="em-label">Accel</span>
            <span className="em-value" style={{ color: '#a78bfa' }}>{mag} G</span>
          </div>
        </div>
      </div>

      {/* Right — LLM reasoning (typewriter) */}
      <div className="event-llm">
        <div className="llm-header">
          <span className="llm-header-title">AI Reasoning</span>
          {streaming && <span className="llm-live-badge">Writing...</span>}
          {!streaming && insight && <span className="llm-done-badge">Complete</span>}
        </div>

        <div className="llm-content">
          {/* Waiting before stream starts */}
          {!insight && !streaming && (
            <span className="llm-thinking">Connecting to AI model...</span>
          )}
          {!insight && streaming && (
            <span className="llm-thinking">Analyzing anomaly...</span>
          )}

          {/* Characters appear here one by one */}
          <span className="llm-text">{insight}</span>

          {/* Blinking cursor while writing */}
          {streaming && <span className="cursor-blink">|</span>}
        </div>
      </div>

    </div>
  );
}
