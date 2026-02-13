import { useState, useEffect } from 'react';
import './StreakHealthBar.css';

/**
 * Visual health bar showing daily consistency level
 * Duolingo-inspired progress indicator
 */
function StreakHealthBar({ habits }) {
  const [healthPercentage, setHealthPercentage] = useState(100);
  const [healthState, setHealthState] = useState('healthy');

  useEffect(() => {
    if (!habits || habits.length === 0) {
      setHealthPercentage(0);
      setHealthState('empty');
      return;
    }

    const completedCount = habits.filter(h => h.completed_today).length;
    const totalCount = habits.length;
    const percentage = Math.round((completedCount / totalCount) * 100);

    setHealthPercentage(percentage);

    // Determine health state
    if (percentage === 100) {
      setHealthState('perfect');
    } else if (percentage >= 75) {
      setHealthState('healthy');
    } else if (percentage >= 50) {
      setHealthState('warning');
    } else if (percentage > 0) {
      setHealthState('critical');
    } else {
      setHealthState('empty');
    }
  }, [habits]);

  const getStateMessage = () => {
    switch (healthState) {
      case 'perfect':
        return {
          icon: '🎉',
          text: 'Perfect Day!',
          subtext: 'All habits completed',
        };
      case 'healthy':
        return {
          icon: '💪',
          text: 'Great Progress',
          subtext: `${healthPercentage}% complete`,
        };
      case 'warning':
        return {
          icon: '⚡',
          text: 'Keep Going',
          subtext: `${healthPercentage}% - You can do this!`,
        };
      case 'critical':
        return {
          icon: '🔔',
          text: 'Streaks at Risk',
          subtext: `Only ${healthPercentage}% done`,
        };
      case 'empty':
        return {
          icon: '🌱',
          text: 'Start Your Day',
          subtext: 'Begin checking in',
        };
      default:
        return {
          icon: '📊',
          text: 'Habit Health',
          subtext: 'Track your progress',
        };
    }
  };

  const message = getStateMessage();

  return (
    <div className={`streak-health-bar ${healthState}`}>
      <div className="health-header">
        <div className="health-info">
          <span className="health-icon">{message.icon}</span>
          <div className="health-text">
            <h3 className="health-title">{message.text}</h3>
            <p className="health-subtext">{message.subtext}</p>
          </div>
        </div>
        <div className="health-percentage">
          {healthPercentage}%
        </div>
      </div>

      <div className="health-bar-container">
        <div
          className="health-bar-fill"
          style={{ width: `${healthPercentage}%` }}
        >
          {healthState === 'perfect' && (
            <div className="sparkles">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="sparkle"
                  style={{
                    left: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 2}s`,
                  }}
                >
                  ✨
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StreakHealthBar;
