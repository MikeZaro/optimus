import { useState, useEffect } from 'react';
import './GoalStatusCard.css';

/**
 * Main goal status card - Duolingo-inspired
 * Shows overall goal momentum and progress
 */
function GoalStatusCard({ goals, onOpenDashboard }) {
  const [cardState, setCardState] = useState('no-goals');
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (!goals || goals.length === 0) {
      setCardState('no-goals');
      return;
    }

    const activeGoals = goals.filter((g) => g.status === 'active');

    if (activeGoals.length === 0) {
      setCardState('all-complete');
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3000);
    } else if (activeGoals.length >= 3) {
      setCardState('focused');
    } else if (activeGoals.length > 0) {
      setCardState('building');
    }
  }, [goals]);

  const getCardContent = () => {
    switch (cardState) {
      case 'no-goals':
        return {
          title: 'GOALS',
          gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        };

      case 'all-complete':
        return {
          title: 'GOALS',
          gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          glow: true,
        };

      case 'building':
        return {
          title: 'GOALS',
          gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        };

      case 'focused':
        return {
          title: 'GOALS',
          gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
          pulse: true,
        };

      default:
        return {
          title: 'GOALS',
          gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        };
    }
  };

  const content = getCardContent();

  return (
    <button
      type="button"
      className={`goal-status-card ${cardState} ${content.glow ? 'glow' : ''} ${content.pulse ? 'pulse' : ''}`}
      style={{ background: content.gradient }}
      onClick={onOpenDashboard}
      aria-label="Open goals dashboard"
    >
      {showCelebration && (
        <div className="celebration-container">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="celebration-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.8}s`,
                background: ['#ffd700', '#ff6b6b', '#4facfe', '#f093fb', '#43e97b'][i % 5],
              }}
            />
          ))}
        </div>
      )}

      <div className="goal-status-center">
        <h2 className="goal-status-center-title">{content.title}</h2>
      </div>
    </button>
  );
}

export default GoalStatusCard;
