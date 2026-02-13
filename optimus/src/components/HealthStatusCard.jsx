import { useState, useEffect } from 'react';
import './HealthStatusCard.css';

function HealthStatusCard({ data }) {
  const [cardState, setCardState] = useState('loading');
  const [message, setMessage] = useState({});

  useEffect(() => {
    if (!data || Object.keys(data).length === 0) {
      setCardState('no-data');
      setMessage({
        emoji: '📊',
        title: 'No Health Data Yet',
        subtitle: 'Import your Apple Health data to get started'
      });
      return;
    }

    // Determine state based on today's activity
    const stepsGoal = 10000;
    const sleepGoal = 7;

    const stepsPercent = (data.steps / stepsGoal) * 100;
    const sleepHours = data.sleep || 0;

    if (stepsPercent >= 100 && sleepHours >= sleepGoal) {
      setCardState('excellent-day');
      setMessage({
        emoji: '🌟',
        title: 'Exceptional Day!',
        subtitle: `${data.steps.toLocaleString()} steps · ${sleepHours}h sleep`
      });
    } else if (stepsPercent >= 80 || sleepHours >= 6.5) {
      setCardState('good-day');
      setMessage({
        emoji: '💪',
        title: 'Great Progress',
        subtitle: `${data.steps.toLocaleString()} steps today`
      });
    } else if (stepsPercent >= 50) {
      setCardState('moderate-day');
      setMessage({
        emoji: '🚶',
        title: 'Keep Moving',
        subtitle: `${Math.round(100 - stepsPercent)}% to daily goal`
      });
    } else {
      setCardState('low-activity');
      setMessage({
        emoji: '😴',
        title: 'Rest Day',
        subtitle: 'Recovery is important too'
      });
    }
  }, [data]);

  return (
    <div className={`health-status-card ${cardState}`}>
      <div className="health-status-content">
        <span className="status-emoji-large">{message.emoji}</span>
        <div className="status-text-large">
          <h2 className="status-title-large">{message.title}</h2>
          <p className="status-subtitle-large">{message.subtitle}</p>
        </div>

        {/* Activity ring (similar to GoalStatusCard circular indicator) */}
        {data.steps && (
          <div className="health-ring-indicator">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r="35"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="8"
              />
              <circle
                cx="40"
                cy="40"
                r="35"
                fill="none"
                stroke="white"
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 35}`}
                strokeDashoffset={`${2 * Math.PI * 35 * (1 - (data.steps / 10000))}`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
                style={{ transition: 'stroke-dashoffset 1s ease' }}
              />
            </svg>
            <div className="ring-text">
              {Math.round((data.steps / 10000) * 100)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default HealthStatusCard;
