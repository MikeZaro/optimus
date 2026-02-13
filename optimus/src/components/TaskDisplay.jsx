import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import './TaskDisplay.css';

const API_URL = 'http://localhost:3001/api';

export default function TaskDisplay({ area, goalId }) {
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [customTaskContent, setCustomTaskContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTaskAction, setActiveTaskAction] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const feedbackTimerRef = useRef(null);
  const bootstrappedGoalIdsRef = useRef(new Set());

  const showFeedback = useCallback((type, message) => {
    setFeedback({ type, message });
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const fetchOpenTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('goal_id', goalId)
      .is('completed_at', null)
      .is('skipped_at', null)
      .order('source', { ascending: false })
      .order('presented_at', { ascending: true })
      .limit(12);

    if (error) throw error;

    return (data || [])
      .sort((a, b) => {
        if (a.source === b.source) return 0;
        if (a.source === 'user_added') return -1;
        if (b.source === 'user_added') return 1;
        return 0;
      })
      .slice(0, 3);
  }, [goalId]);

  const requestInitialTasks = useCallback(async () => {
    const response = await fetch(`${API_URL}/curator/generate-tasks/${goalId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate initial tasks');
    }
  }, [area, goalId]);

  const loadTasks = useCallback(async () => {
    if (!goalId) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    try {
      let prioritized = await fetchOpenTasks();

      // Fallback: if a new/switched goal has no open tasks, try generating once.
      if (prioritized.length === 0 && !bootstrappedGoalIdsRef.current.has(goalId)) {
        bootstrappedGoalIdsRef.current.add(goalId);
        setIsBootstrapping(true);
        await requestInitialTasks();
        prioritized = await fetchOpenTasks();
      }

      setTasks(prioritized);
    } catch (error) {
      console.error('Error loading tasks:', error);
      showFeedback('error', 'Failed to load tasks.');
    } finally {
      setIsBootstrapping(false);
      setIsLoading(false);
    }
  }, [fetchOpenTasks, goalId, requestInitialTasks, showFeedback]);

  useEffect(() => {
    if (goalId) {
      setIsLoading(true);
      loadTasks();

      const subscription = supabase
        .channel(`tasks-${area}-${goalId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tasks',
            filter: `goal_id=eq.${goalId}`,
          },
          () => loadTasks()
        )
        .subscribe();

      return () => subscription.unsubscribe();
    }

    setTasks([]);
    setIsLoading(false);
  }, [area, goalId, loadTasks]);

  const handleGenerateNow = async () => {
    if (!goalId || isBootstrapping || isLoading) return;

    setIsBootstrapping(true);
    try {
      await requestInitialTasks();
      bootstrappedGoalIdsRef.current.add(goalId);
      await loadTasks();
      showFeedback('success', 'Generated new tasks.');
    } catch (error) {
      console.error('Error generating tasks:', error);
      showFeedback('error', 'Failed to generate tasks. Please try again.');
    } finally {
      setIsBootstrapping(false);
    }
  };

  const handleComplete = async (taskId) => {
    setActiveTaskAction(taskId);

    try {
      const { data: updatedTask, error } = await supabase
        .from('tasks')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', taskId)
        .select('id, completed_at')
        .maybeSingle();

      if (error) throw error;
      if (!updatedTask?.id) throw new Error('Task completion did not persist');

      const nextTaskResponse = await fetch(`${API_URL}/curator/next-task/${goalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area }),
      });
      if (!nextTaskResponse.ok) throw new Error('Failed to generate next task');

      // Do an immediate refresh even if realtime subscription is delayed.
      await loadTasks();

      showFeedback('success', 'Task completed.');
    } catch (error) {
      console.error('Error completing task:', error);
      showFeedback('error', 'Failed to complete task. Please try again.');
    } finally {
      setActiveTaskAction(null);
    }
  };

  const handleSkip = async (taskId) => {
    setActiveTaskAction(taskId);

    try {
      const { data: updatedTask, error } = await supabase
        .from('tasks')
        .update({ skipped_at: new Date().toISOString() })
        .eq('id', taskId)
        .select('id, skipped_at')
        .maybeSingle();

      if (error) throw error;
      if (!updatedTask?.id) throw new Error('Task skip did not persist');

      const nextTaskResponse = await fetch(`${API_URL}/curator/next-task/${goalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area }),
      });
      if (!nextTaskResponse.ok) throw new Error('Failed to generate next task');

      // Do an immediate refresh even if realtime subscription is delayed.
      await loadTasks();

      showFeedback('success', 'Task skipped.');
    } catch (error) {
      console.error('Error skipping task:', error);
      showFeedback('error', 'Failed to skip task. Please try again.');
    } finally {
      setActiveTaskAction(null);
    }
  };

  const handleAddCustomTask = async (e) => {
    e.preventDefault();
    if (!customTaskContent.trim()) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('tasks')
        .insert({
          goal_id: goalId,
          area,
          content: customTaskContent.trim(),
          source: 'user_added',
          presented_at: new Date().toISOString(),
        });

      if (error) throw error;

      setCustomTaskContent('');
      setShowAddModal(false);
      await loadTasks();
      showFeedback('success', 'Custom task added.');
    } catch (error) {
      console.error('Error adding custom task:', error);
      showFeedback('error', 'Failed to add task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!goalId) {
    return (
      <div className="task-display">
        <p className="task-empty">Create a goal to see tasks</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="task-display">
        <div className="task-skeleton-list">
          <div className="task-skeleton-card" />
          <div className="task-skeleton-card" />
          <div className="task-skeleton-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="task-display">
      {feedback && (
        <div className={`task-feedback task-feedback-${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="task-empty">
          <p>
            {isBootstrapping
              ? 'Generating tasks for your goal...'
              : 'No open tasks right now.'}
          </p>
          {!isBootstrapping && (
            <button onClick={handleGenerateNow} className="task-btn task-btn-primary">
              Generate Tasks Now
            </button>
          )}
        </div>
      ) : (
        <div className="task-list">
          {tasks.map((task, index) => (
            <div key={task.id} className={`task-card ${task.source === 'user_added' ? 'task-card-custom' : ''}`}>
              <div className="task-content">
                <div className="task-meta">
                  <span className="task-step">Step {index + 1}</span>
                  {task.source === 'user_added' && <span className="task-badge">Custom</span>}
                </div>
                <p>{task.content}</p>
              </div>
              <div className="task-actions">
                <button
                  onClick={() => handleComplete(task.id)}
                  className="task-btn task-btn-complete"
                  title="Complete this task"
                  disabled={activeTaskAction === task.id}
                >
                  {activeTaskAction === task.id ? 'Working...' : 'Complete'}
                </button>
                <button
                  onClick={() => handleSkip(task.id)}
                  className="task-btn task-btn-skip"
                  title="Skip this task"
                  disabled={activeTaskAction === task.id}
                >
                  {activeTaskAction === task.id ? 'Working...' : 'Skip'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => setShowAddModal(true)} className="task-add-btn">
        + Add Custom Task
      </button>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Add Custom Task</h3>
            <form onSubmit={handleAddCustomTask}>
              <textarea
                value={customTaskContent}
                onChange={(e) => setCustomTaskContent(e.target.value)}
                placeholder="Describe your task..."
                className="task-textarea"
                autoFocus
                disabled={isSubmitting}
                rows={3}
              />
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="task-btn task-btn-secondary"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="task-btn task-btn-primary"
                  disabled={isSubmitting || !customTaskContent.trim()}
                >
                  {isSubmitting ? 'Adding...' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
