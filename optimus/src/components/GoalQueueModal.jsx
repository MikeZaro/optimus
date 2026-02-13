import { useCallback, useEffect, useState } from 'react';

const API_URL = 'http://localhost:3001/api';

export default function GoalQueueModal({ area, onSelect, onClose }) {
  const [queue, setQueue] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);

  const loadQueue = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/goal-queue/${area}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load queue');
      }

      setQueue(data.queue || []);
    } catch (error) {
      console.error('Error loading goal queue:', error);
      setQueue([]);
    } finally {
      setIsLoading(false);
    }
  }, [area]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleSelect = async (goalId) => {
    setIsSelecting(true);

    try {
      const response = await fetch(`${API_URL}/goals/reactivate/${goalId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to reactivate goal');
      }

      onSelect();
    } catch (error) {
      console.error('Error reactivating goal:', error);
      alert('Failed to reactivate goal. Please try again.');
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Select Goal from Queue</h3>

        {isLoading ? (
          <p>Loading queue...</p>
        ) : queue.length === 0 ? (
          <p>No paused goals. Create a new goal instead.</p>
        ) : (
          <div className="queue-list">
            {queue.map((item) => (
              <div key={item.id} className="queue-item">
                <h4>{item.goals?.title || 'Untitled Goal'}</h4>
                <p>Paused with {item.tasks_completed_before_pause || 0} tasks completed</p>
                <button
                  onClick={() => handleSelect(item.goal_id)}
                  className="goal-btn goal-btn-primary"
                  disabled={isSelecting}
                >
                  {isSelecting ? 'Resuming...' : 'Resume This Goal'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose} className="goal-btn goal-btn-secondary" disabled={isSelecting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
