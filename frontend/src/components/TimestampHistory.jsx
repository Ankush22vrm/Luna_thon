function formatTime(ts) {
  return new Date(ts).toLocaleString('en-US', { hour12: false });
}

function getBadgeColor(confidence) {
  if (confidence >= 0.8) return '#ff2d2d';
  if (confidence >= 0.5) return '#ff8c00';
  return '#e6c200';
}

export default function TimestampHistory({ events }) {
  if (events.length === 0) {
    return (
      <div className="panel">
        <h3 className="panel-title">Event History</h3>
        <p className="muted-text">No events recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3 className="panel-title">Event History</h3>
      <div className="table-scroll">
        <table className="history-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>HR (bpm)</th>
              <th>SpO2 (%)</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{formatTime(event.timestamp)}</td>
                <td>{event.reading?._anomalyType || 'UNKNOWN'}</td>
                <td>{event.reading?.heartRate?.toFixed(1)}</td>
                <td>{event.reading?.spo2?.toFixed(1)}</td>
                <td>
                  <span
                    className="conf-badge"
                    style={{ background: getBadgeColor(event.confidence) }}
                  >
                    {(event.confidence * 100).toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
