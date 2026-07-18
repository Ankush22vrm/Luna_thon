import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';

function getColor(confidence) {
  if (confidence >= 0.8) return '#ff2d2d';
  if (confidence >= 0.5) return '#ff8c00';
  return '#e6c200';
}

export default function ConfidenceGauge({ confidence }) {
  const pct = confidence != null ? confidence * 100 : 0;
  const color = getColor(confidence);

  const data = [
    { value: 100, fill: '#222' },       // background track
    { value: pct,  fill: color },       // confidence arc
  ];

  return (
    <div className="gauge-wrapper">
      <h3 className="panel-title">Anomaly Confidence</h3>
      <div className="gauge-chart">
        <ResponsiveContainer width={180} height={180}>
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            barSize={14}
            data={data}
            startAngle={225}
            endAngle={-45}
          >
            <RadialBar dataKey="value" background cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="gauge-label">
          <span className="gauge-value" style={{ color }}>{pct.toFixed(0)}%</span>
          <span className="gauge-sub">confidence</span>
        </div>
      </div>
    </div>
  );
}
