import { useLLMStream } from '../hooks/useLLMStream';

export default function LLMInsightPanel({ latestAnomaly }) {
  const { insight, streaming } = useLLMStream(latestAnomaly);

  return (
    <div className="panel llm-panel">
      <h3 className="panel-title">AI Clinical Insight</h3>

      {!latestAnomaly && (
        <p className="muted-text">Waiting for an anomaly event to analyze...</p>
      )}

      {latestAnomaly && (
        <div className="llm-body">
          <div className="llm-meta">
            <span className="llm-type">{latestAnomaly.reading?._anomalyType || 'ANOMALY'}</span>
            <span className="llm-conf">
              Confidence: {(latestAnomaly.confidence * 100).toFixed(1)}%
            </span>
          </div>

          <div className="llm-text">
            {streaming && !insight && (
              <span className="muted-text">Analyzing...</span>
            )}
            <span>{insight}</span>
            {streaming && <span className="cursor-blink">|</span>}
          </div>
        </div>
      )}
    </div>
  );
}
