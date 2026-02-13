import { useState } from 'react';
import './HabitTile.css';

/**
 * Individual habit tile with streak display and completion toggle
 * Visual feedback based on streak length
 */
function HabitTile({ habit, onComplete, isLoading }) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleComplete = async () => {
    if (habit.completed_today || isLoading) return;

    setIsAnimating(true);
    await onComplete(habit.id);

    // Reset animation after completion
    setTimeout(() => setIsAnimating(false), 1000);
  };

  // Determine visual tier based on streak
  const getStreakTier = (streak) => {
    if (streak === 0) return 'none';
    if (streak <= 2) return 'starter';
    if (streak <= 7) return 'building';
    if (streak <= 30) return 'strong';
    return 'legendary';
  };

  const tier = getStreakTier(habit.current_streak || 0);
  const isCompleted = habit.completed_today;
  const isMissed = !isCompleted && habit.current_streak === 0;

  // Get icon (default to emoji if not provided)
  const icon = habit.icon || '✨';

  return (
    <div
      className={`
        habit-tile
        tier-${tier}
        ${isCompleted ? 'completed' : ''}
        ${isMissed ? 'missed' : ''}
        ${isAnimating ? 'animating' : ''}
      `}
    >
      {/* Left: Icon */}
      <div className="habit-icon">
        <span className="icon-emoji">{icon}</span>
      </div>

      {/* Center: Name and details */}
      <div className="habit-info">
        <h4 className="habit-name">{habit.title}</h4>
        {habit.target_time_of_day && habit.target_time_of_day !== 'anytime' && (
          <span className="habit-time">
            {habit.target_time_of_day}
          </span>
        )}
      </div>

      {/* Right: Streak badge */}
      <div className="habit-streak-container">
        <div className={`streak-badge tier-${tier}`}>
          <div className="streak-flame">🔥</div>
          <div className="streak-number">{habit.current_streak || 0}</div>
        </div>
      </div>

      {/* Toggle button */}
      <button
        className={`habit-complete-btn ${isCompleted ? 'done' : ''}`}
        onClick={handleComplete}
        disabled={isCompleted || isLoading}
      >
        {isCompleted ? (
          <span className="check-icon">✓</span>
        ) : (
          <span className="circle-icon">○</span>
        )}
      </button>

      {/* Ripple effect on completion */}
      {isAnimating && (
        <>
          <div className="ripple ripple-1" />
          <div className="ripple ripple-2" />
          <div className="ripple ripple-3" />
        </>
      )}
    </div>
  );
}

export default HabitTile;
