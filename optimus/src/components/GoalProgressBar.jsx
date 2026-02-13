import { useState, useEffect } from 'react';
import './GoalProgressBar.css';

/**
 * Visual progress bar for goal completion
 * Duolingo-inspired momentum tracking
 */
function GoalProgressBar({ goals, onOpenCompletedGoals, onOpenActiveGoals }) {
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [progressState, setProgressState] = useState('empty');
  const [activeCount, setActiveCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    if (!goals || goals.length === 0) {
      setProgressPercentage(0);
      setProgressState('empty');
      setActiveCount(0);
      setCompletedCount(0);
      return;
    }

    const active = goals.filter(g => g.status === 'active').length;
    const completed = goals.filter(g => g.status === 'completed').length;
    const total = goals.length;

    setActiveCount(active);
    setCompletedCount(completed);

    // Calculate progress as ratio of completed goals
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    setProgressPercentage(percentage);

    // Determine state
    if (percentage === 100) {
      setProgressState('perfect');
    } else if (percentage >= 75) {
      setProgressState('excellent');
    } else if (percentage >= 50) {
      setProgressState('good');
    } else if (percentage >= 25) {
      setProgressState('building');
    } else if (percentage > 0) {
      setProgressState('starting');
    } else {
      setProgressState('empty');
    }
  }, [goals]);

  const getStateMessage = () => {
    switch (progressState) {
      case 'perfect':
        return {
          icon: '🏆',
          text: 'All Goals Achieved!',
          subtext: 'Perfect completion rate',
        };
      case 'excellent':
        return {
          icon: '🌟',
          text: 'Excellent Progress',
          subtext: `${completedCount} completed, ${activeCount} in progress`,
        };
      case 'good':
        return {
          icon: '💪',
          text: 'Good Momentum',
          subtext: `${completedCount} completed, ${activeCount} active`,
        };
      case 'building':
        return {
          icon: '🚀',
          text: 'Building Progress',
          subtext: `${activeCount} active goals`,
        };
      case 'starting':
        return {
          icon: '🎯',
          text: 'Getting Started',
          subtext: `${activeCount} goals in motion`,
        };
      case 'empty':
        return {
          icon: '✨',
          text: 'Ready to Begin',
          subtext: 'Set your first goal to start',
        };
      default:
        return {
          icon: '📊',
          text: 'Goal Progress',
          subtext: 'Track your journey',
        };
    }
  };

  const message = getStateMessage();

  return (
    <div className={`goal-progress-bar ${progressState}`}>
      <div className="progress-header">
        <div className="progress-info">
          <span className="progress-icon">{message.icon}</span>
          <div className="progress-text">
            <h3 className="progress-title">{message.text}</h3>
            <p className="progress-subtext">{message.subtext}</p>
          </div>
        </div>
        <div className="progress-percentage">
          {progressPercentage}%
        </div>
      </div>

      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{ width: `${progressPercentage}%` }}
        >
          {/* Shimmer effect for perfect state */}
          {progressState === 'perfect' && (
            <div className="shimmer-overlay" />
          )}

          {/* Progress milestones */}
          <div className="milestone-markers">
            {[25, 50, 75, 100].map((milestone) => (
              <div
                key={milestone}
                className={`milestone-marker ${
                  progressPercentage >= milestone ? 'reached' : ''
                }`}
                style={{ left: `${milestone}%` }}
              >
                {progressPercentage >= milestone && (
                  <span className="milestone-icon">✓</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Goal counts */}
      <div className="goal-counts">
        <button
          type="button"
          className={`count-item active ${onOpenActiveGoals ? 'clickable' : ''}`}
          onClick={() => onOpenActiveGoals && onOpenActiveGoals()}
          disabled={!onOpenActiveGoals || activeCount === 0}
          title={activeCount > 0 ? 'View active goals' : 'No active goals yet'}
        >
          <span className="count-number">{activeCount}</span>
          <span className="count-label">Active</span>
        </button>
        <button
          type="button"
          className={`count-item completed ${onOpenCompletedGoals ? 'clickable' : ''}`}
          onClick={() => onOpenCompletedGoals && onOpenCompletedGoals()}
          disabled={!onOpenCompletedGoals || completedCount === 0}
          title={completedCount > 0 ? 'View completed goals' : 'No completed goals yet'}
        >
          <span className="count-number">{completedCount}</span>
          <span className="count-label">Completed</span>
        </button>
      </div>
    </div>
  );
}

export default GoalProgressBar;
