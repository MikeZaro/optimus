import { useState, useEffect } from 'react';
import './HealthDashboardCard.css';

function HealthDashboardCard({ healthData, onViewHealth }) {
  const [cardState, setCardState] = useState('loading');

  useEffect(() => {
    if (!healthData || Object.keys(healthData).length === 0) {
      setCardState('no-data');
      return;
    }

    // Determine card state based on today's metrics
    const stepsGoal = 10000;
    const stepsPercent = (healthData.steps / stepsGoal) * 100;

    if (stepsPercent >= 80) setCardState('active-day');
    else if (stepsPercent >= 50) setCardState('moderate-day');
    else setCardState('low-activity');
  }, [healthData]);

  return (
    <div className={`health-dashboard-card ${cardState}`}>
      {/* Header with icon and title */}
      <div className="health-card-header">
        <span className="health-icon">❤️</span>
        <h3>Health Today</h3>
      </div>

      {/* Metrics - vertical stack */}
      <div className="health-metrics-stack">
        {/* Steps */}
        <div className="health-metric-row">
          <span className="metric-emoji">🚶</span>
          <div className="metric-info">
            <div className="metric-label">Steps</div>
            <div className="metric-value">{(healthData.steps || 0).toLocaleString()}</div>
          </div>
          <div className="metric-progress-mini">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(((healthData.steps || 0) / 10000) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Sleep */}
        <div className="health-metric-row">
          <span className="metric-emoji">😴</span>
          <div className="metric-info">
            <div className="metric-label">Sleep</div>
            <div className="metric-value">{(healthData.sleep || 0).toFixed(1)}h</div>
          </div>
          <div className="metric-progress-mini">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(((healthData.sleep || 0) / 8) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Heart Rate */}
        {healthData.heartRate?.avg > 0 && (
          <div className="health-metric-row">
            <span className="metric-emoji">❤️</span>
            <div className="metric-info">
              <div className="metric-label">Heart Rate</div>
              <div className="metric-value">{healthData.heartRate.avg} bpm</div>
            </div>
          </div>
        )}

        {/* Calories */}
        {healthData.calories > 0 && (
          <div className="health-metric-row">
            <span className="metric-emoji">🔥</span>
            <div className="metric-info">
              <div className="metric-label">Calories</div>
              <div className="metric-value">{Math.round(healthData.calories)}</div>
            </div>
          </div>
        )}
      </div>

      {/* View Health button */}
      <button className="view-health-btn" onClick={onViewHealth}>
        View Health →
      </button>
    </div>
  );
}

export default HealthDashboardCard;
