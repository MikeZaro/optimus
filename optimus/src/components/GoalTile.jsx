import { useState } from 'react';
import './GoalTile.css';

/**
 * Compact goal card with gamified visual feedback
 * Card-based design for better space utilization
 */
function GoalTile({ goal, onOpen, onComplete, onIncomplete, isLoading, cardNumber }) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleComplete = async () => {
    if (isLoading) return;
    setIsAnimating(true);
    await onComplete(goal.id);
    setTimeout(() => setIsAnimating(false), 1000);
  };

  // Determine visual state
  const getGoalState = () => {
    if (goal.status === 'completed') return 'completed';
    if (goal.status === 'incomplete') return 'incomplete';
    return 'active';
  };

  // Get area-specific styling
  const getAreaColor = (area) => {
    const colors = {
      work: { primary: '#4facfe', secondary: '#00f2fe' },
      personal: { primary: '#f093fb', secondary: '#f5576c' },
      education: { primary: '#43e97b', secondary: '#38f9d7' },
    };
    return colors[area] || colors.work;
  };

  const state = getGoalState();
  const areaColors = getAreaColor(goal.area);

  // Format title
  const formatTitle = (text) => {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  };

  return (
    <div
      className={`goal-card state-${state} area-${goal.area} ${isAnimating ? 'animating' : ''} ${isHovered ? 'hovered' : ''}`}
      style={{
        '--area-primary': areaColors.primary,
        '--area-secondary': areaColors.secondary,
      }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(goal)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(goal);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header with card number and area */}
      <div className="goal-card-header">
        <div className="goal-emoji-circle">{cardNumber}</div>
        <span className="goal-area-chip">{goal.area}</span>
      </div>

      {/* Title */}
      <h3 className="goal-card-title">{formatTitle(goal.title)}</h3>

      {/* Progress indicator (simulated based on tasks - you can enhance this) */}
      <div className="goal-progress-mini">
        <div className="progress-bar-mini">
          <div className="progress-fill-mini" style={{ width: '40%' }} />
        </div>
        <span className="progress-text-mini">In Progress</span>
      </div>

      {/* Action buttons */}
      <div className="goal-card-actions">
        {state === 'active' && (
          <button
            className="goal-card-btn btn-complete"
            onClick={(e) => {
              e.stopPropagation();
              handleComplete();
            }}
            disabled={isLoading}
          >
            Done
          </button>
        )}
      </div>

      {/* Quick action menu (appears on hover) */}
      {isHovered && state === 'active' && (
        <button
          className="goal-quick-archive"
          onClick={(e) => {
            e.stopPropagation();
            onIncomplete(goal.id);
          }}
          disabled={isLoading}
          title="Archive goal"
        >
          x
        </button>
      )}

      {/* Completion ripple effect */}
      {isAnimating && (
        <>
          <div className="goal-ripple ripple-1" />
          <div className="goal-ripple ripple-2" />
          <div className="goal-ripple ripple-3" />
        </>
      )}

      {/* Status badge */}
      {state === 'completed' && (
        <div className="goal-completed-overlay">
          <div className="completed-badge-large">OK</div>
        </div>
      )}
    </div>
  );
}

export default GoalTile;
