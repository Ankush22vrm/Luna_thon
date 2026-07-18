import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// Formats raw timestamp to HH:MM:SS for the X axis
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
}

// Formats tooltip value to 2 decimal places
function formatValue(value) {
  return typeof value === 'number' ? value.toFixed(2) : value;
}

export default function SensorChart({ title, data, color, unit, refLines }) {
  return (
    <div className="chart-card">
      <div className="chart-header">
        <span className="chart-title">{title}</span>
        <span className="chart-unit">{unit}</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tickFormatter={formatTime}
            tick={{ fill: '#888', fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: '#888', fontSize: 10 }}
            tickFormatter={formatValue}
          />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 6 }}
            labelFormatter={formatTime}
            formatter={(val) => [formatValue(val), title]}
          />
          {(refLines || []).map((ref) => (
            <ReferenceLine
              key={ref.label}
              y={ref.y}
              stroke={ref.color || '#ff4444'}
              strokeDasharray="4 2"
              label={{ value: ref.label, fill: ref.color || '#ff4444', fontSize: 10 }}
            />
          ))}
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${title})`}
            dot={false}
            isAnimationActive={false}  // disabled for real-time performance
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
