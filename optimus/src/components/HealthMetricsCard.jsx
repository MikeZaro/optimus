import './HealthMetricsCard.css';

function HealthMetricsCard({ type, title, emoji, value, unit, goal, trend }) {
  const percentage = goal ? Math.min((value / goal) * 100, 100) : 0;

  // Generate SVG sparkline from trend data
  const generateSparkline = () => {
    if (!trend || trend.length === 0) return null;

    const width = 200;
    const height = 40;
    const max = Math.max(...trend.map(d => d.value), goal || 0);
    const points = trend.map((d, i) => {
      const x = (i / (trend.length - 1)) * width;
      const y = height - (d.value / max) * height;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div className={`health-metric-card metric-${type}`}>
      <div className="metric-header">
        <span className="metric-emoji">{emoji}</span>
        <h3 className="metric-title">{title}</h3>
      </div>

      <div className="metric-value">
        <span className="value-number">{Math.round(value).toLocaleString()}</span>
        <span className="value-unit">{unit}</span>
      </div>

      {/* Progress bar */}
      {goal && (
        <div className="metric-progress">
          <div className="progress-bar-mini">
            <div
              className="progress-fill-mini"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="progress-text-mini">
            {Math.round(percentage)}% of {goal.toLocaleString()} {unit} goal
          </span>
        </div>
      )}

      {/* Sparkline trend */}
      <div className="metric-trend">
        {generateSparkline()}
      </div>
    </div>
  );
}

export default HealthMetricsCard;
