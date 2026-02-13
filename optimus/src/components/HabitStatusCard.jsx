import { useState, useEffect } from 'react';
import './HabitStatusCard.css';

/**
 * Main status card that changes based on user's habit state
 * Duolingo-inspired visual feedback
 */
function HabitStatusCard({ habits, onStartHabits }) {
  const [cardState, setCardState] = useState('no-habits');
  const [totalStreak, setTotalStreak] = useState(0);
  const [completedToday, setCompletedToday] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (!habits || habits.length === 0) {
      setCardState('no-habits');
      return;
    }

    const completed = habits.filter(h => h.completed_today).length;
    const totalHabits = habits.length;
    const avgStreak = Math.floor(
      habits.reduce((sum, h) => sum + (h.current_streak || 0), 0) / totalHabits
    );
    const anyMissedToday = habits.some(h => !h.completed_today);

    setCompletedToday(completed);
    setTotalStreak(avgStreak);

    if (completed === totalHabits) {
      setCardState('completed');
      // Show confetti briefly
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    } else if (avgStreak > 0) {
      setCardState('active-streak');
    } else if (anyMissedToday) {
      setCardState('at-risk');
    }
  }, [habits]);

  const getCardContent = () => {
    switch (cardState) {
      case 'no-habits':
        return {
          emoji: '🎯',
          title: 'Start Your Streak',
          subtitle: 'Create your first habit to begin building consistency',
          gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          showButton: true,
        };

      case 'completed':
        return {
          emoji: '🔥',
          title: `${totalStreak} Day Streak!`,
          subtitle: `All ${completedToday} habits completed today. You're crushing it!`,
          gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          glow: true,
        };

      case 'active-streak':
        return {
          emoji: '⚡',
          title: `${totalStreak} Day Streak`,
          subtitle: `${completedToday} of ${habits.length} habits done today`,
          gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        };

      case 'at-risk':
        return {
          emoji: '⚠️',
          title: 'Streak at Risk',
          subtitle: `Complete ${habits.length - completedToday} more to protect your streak`,
          gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          pulse: true,
        };

      default:
        return {
          emoji: '📊',
          title: 'Habit Tracker',
          subtitle: 'Track your daily habits',
          gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        };
    }
  };

  const content = getCardContent();

  return (
    <div
      className={`habit-status-card ${cardState} ${content.glow ? 'glow' : ''} ${content.pulse ? 'pulse' : ''}`}
      style={{ background: content.gradient }}
      role="button"
      tabIndex={0}
      onClick={onStartHabits}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onStartHabits();
        }
      }}
    >
      {showConfetti && (
        <div className="confetti-container">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="confetti" style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 0.5}s`,
              background: ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff'][i % 5]
            }} />
          ))}
        </div>
      )}

      <div className="status-card-content">
        <div className="status-emoji">{content.emoji}</div>
        <div className="status-text">
          <h2 className="status-title">{content.title}</h2>
          <p className="status-subtitle">{content.subtitle}</p>
        </div>
        {content.showButton && (
          <button
            className="status-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onStartHabits();
            }}
          >
            Create First Habit
          </button>
        )}
      </div>
    </div>
  );
}

export default HabitStatusCard;
