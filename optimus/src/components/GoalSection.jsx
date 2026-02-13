import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import GoalQueueModal from './GoalQueueModal';
import './GoalSection.css';

const API_URL = 'http://localhost:3001/api';

export default function GoalSection({ area, onGoalChanged, isExpanded = false }) {
  const [activeGoal, setActiveGoal] = useState(null);
  const [bottlenecks, setBottlenecks] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDescription, setNewGoalDescription] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const loadActiveGoal = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('area', area)
        .eq('status', 'active')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      setActiveGoal(data);
    } catch (error) {
      console.error('Error loading active goal:', error);
    } finally {
      setIsLoading(false);
    }
  }, [area]);

  const loadBottlenecks = useCallback(async () => {
    if (!activeGoal) return;

    try {
      const response = await fetch(`${API_URL}/bottlenecks/${activeGoal.id}`);
      const data = await response.json();
      setBottlenecks(data.bottlenecks || []);
    } catch (error) {
      console.error('Error loading bottlenecks:', error);
    }
  }, [activeGoal]);

  useEffect(() => {
    loadActiveGoal();

    const subscription = supabase
      .channel(`goals-${area}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goals', filter: `area=eq.${area}` },
        () => loadActiveGoal()
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [area, loadActiveGoal]);

  useEffect(() => {
    if (activeGoal) {
      loadBottlenecks();

      const subscription = supabase
        .channel(`bottlenecks-${activeGoal.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bottlenecks', filter: `goal_id=eq.${activeGoal.id}` },
          () => loadBottlenecks()
        )
        .subscribe();

      return () => subscription.unsubscribe();
    }

    setBottlenecks([]);
  }, [activeGoal, loadBottlenecks]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    setDescriptionDraft(activeGoal?.description || '');
  }, [activeGoal]);

  const getNextQueuePosition = async () => {
    const { data, error } = await supabase
      .from('goal_queue')
      .select('queue_position')
      .eq('area', area)
      .order('queue_position', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return (data?.queue_position ?? 0) + 1;
  };

  const handleCreateGoal = async (e) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;

    setIsSubmitting(true);

    try {
      if (activeGoal) {
        const { data: completedTasks, error: completedTasksError } = await supabase
          .from('tasks')
          .select('id')
          .eq('goal_id', activeGoal.id)
          .not('completed_at', 'is', null);

        if (completedTasksError) throw completedTasksError;

        const { error: pauseError } = await supabase
          .from('goals')
          .update({ status: 'paused' })
          .eq('id', activeGoal.id);

        if (pauseError) throw pauseError;

        const { data: queuedGoal, error: queuedGoalError } = await supabase
          .from('goal_queue')
          .select('id')
          .eq('goal_id', activeGoal.id)
          .maybeSingle();

        if (queuedGoalError) throw queuedGoalError;

        if (!queuedGoal) {
          const nextQueuePosition = await getNextQueuePosition();
          const { error: queueInsertError } = await supabase
            .from('goal_queue')
            .insert({
              goal_id: activeGoal.id,
              area,
              queue_position: nextQueuePosition,
              tasks_completed_before_pause: completedTasks?.length || 0,
            });

          if (queueInsertError) throw queueInsertError;
        }
      }

      const { data: newGoal, error: newGoalError } = await supabase
        .from('goals')
        .insert({
          area,
          title: newGoalTitle.trim(),
          description: newGoalDescription.trim() || null,
          status: 'active',
        })
        .select()
        .single();

      if (newGoalError) throw newGoalError;

      setActiveGoal(newGoal);
      setNewGoalTitle('');
      setNewGoalDescription('');
      setShowCreateModal(false);
      if (onGoalChanged) await onGoalChanged();

      await fetch(`${API_URL}/curator/generate-tasks/${newGoal.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area }),
      });
      setFeedback({ type: 'success', message: 'Goal updated successfully.' });
    } catch (error) {
      console.error('Error creating goal:', error);
      setFeedback({ type: 'error', message: 'Failed to create goal. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!activeGoal || isSavingDescription) return;

    const nextDescription = descriptionDraft.trim() || null;
    if ((activeGoal.description || null) === nextDescription) return;

    setIsSavingDescription(true);
    try {
      const { data: updatedGoal, error } = await supabase
        .from('goals')
        .update({ description: nextDescription })
        .eq('id', activeGoal.id)
        .select('*')
        .single();

      if (error) throw error;

      setActiveGoal(updatedGoal);
      if (onGoalChanged) await onGoalChanged();
      setFeedback({ type: 'success', message: 'Goal description saved.' });
    } catch (error) {
      console.error('Error saving goal description:', error);
      setFeedback({ type: 'error', message: 'Failed to save description. Apply schema update for goals.description.' });
    } finally {
      setIsSavingDescription(false);
    }
  };

  const handleCompleteGoal = async () => {
    if (!activeGoal) return;

    const confirmed = window.confirm(`Mark "${activeGoal.title}" as completed?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_URL}/goals/complete/${activeGoal.id}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Goal completion API failed');
      }

      setActiveGoal(null);
      setShowQueueModal(true);
      if (onGoalChanged) await onGoalChanged();
      setFeedback({ type: 'success', message: 'Goal completed.' });
    } catch (error) {
      console.error('Error completing goal:', error);
      setFeedback({ type: 'error', message: 'Failed to complete goal. Please try again.' });
    }
  };

  const handleOpenSwitchModal = () => {
    if (!activeGoal) {
      setShowCreateModal(true);
      return;
    }

    const confirmed = window.confirm(
      `Switch goals in ${getAreaTitle()}? Current goal "${activeGoal.title}" will be paused.`
    );

    if (confirmed) {
      setShowCreateModal(true);
    }
  };

  const getAreaTitle = () => {
    switch (area) {
      case 'personal':
        return 'Personal Well Being';
      case 'work':
        return 'Work';
      case 'education':
        return 'Education';
      default:
        return area;
    }
  };

  const formatBottleneckType = (type) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const toTitleCase = (value) => {
    return (value || '')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (isLoading) {
    return (
      <div className="goal-section">
        <h2>Loading goal...</h2>
        <div className="goal-loading">Loading...</div>
      </div>
    );
  }

  const headerTitle = activeGoal?.title ? toTitleCase(activeGoal.title) : 'No active goal';

  return (
    <div className={`goal-section ${isExpanded ? 'goal-section-expanded' : ''}`}>
      <h2>{headerTitle}</h2>
      {feedback && (
        <div className={`goal-feedback goal-feedback-${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      {activeGoal ? (
        <div className="goal-active">
          {bottlenecks.length > 0 && (
            <div className={`bottleneck-alert severity-${bottlenecks[0].severity}`}>
              <div className="bottleneck-header">
                <span className="bottleneck-icon">Warning</span>
                <strong>Bottleneck Detected</strong>
                <span className="bottleneck-severity">Severity: {bottlenecks[0].severity}/10</span>
              </div>
              <div className="bottleneck-type">{formatBottleneckType(bottlenecks[0].bottleneck_type)}</div>
              <p className="bottleneck-description">{bottlenecks[0].description}</p>
            </div>
          )}

          <div className="goal-header">
            <div className="goal-actions">
              <button onClick={handleOpenSwitchModal} className="goal-btn goal-btn-secondary">
                Switch Goal
              </button>
              <button onClick={handleCompleteGoal} className="goal-btn goal-btn-complete">
                Complete
              </button>
            </div>
          </div>

          {isExpanded && (
            <div className="goal-description-box">
              <label htmlFor={`goal-description-${area}`}>Goal Description</label>
              <textarea
                id={`goal-description-${area}`}
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                placeholder="Describe success criteria, constraints, preferences, and context so AI can generate better tasks."
                rows={4}
              />
              <div className="goal-description-actions">
                <button
                  type="button"
                  className="goal-btn goal-btn-primary"
                  onClick={handleSaveDescription}
                  disabled={isSavingDescription}
                >
                  {isSavingDescription ? 'Saving...' : 'Save Description'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="goal-empty">
          <p>No active goal in this area</p>
          <div className="goal-empty-actions">
            <button onClick={() => setShowCreateModal(true)} className="goal-btn goal-btn-primary">
              + Create Goal
            </button>
            <button onClick={() => setShowQueueModal(true)} className="goal-btn goal-btn-secondary">
              Resume Paused Goal
            </button>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{activeGoal ? 'Switch to New Goal' : 'Create New Goal'}</h3>
            {activeGoal && <p className="modal-warning">Current goal "{activeGoal.title}" will be paused.</p>}
            <form onSubmit={handleCreateGoal}>
              <input
                type="text"
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                placeholder="Enter your goal..."
                className="goal-input"
                autoFocus
                disabled={isSubmitting}
              />
              <textarea
                value={newGoalDescription}
                onChange={(e) => setNewGoalDescription(e.target.value)}
                placeholder="Optional: add context so AI can generate better tasks."
                className="goal-input goal-description-input"
                rows={4}
                disabled={isSubmitting}
              />
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="goal-btn goal-btn-secondary"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="goal-btn goal-btn-primary"
                  disabled={isSubmitting || !newGoalTitle.trim()}
                >
                  {isSubmitting ? 'Creating...' : 'Create Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQueueModal && (
        <GoalQueueModal
          area={area}
          onSelect={() => {
            setShowQueueModal(false);
            loadActiveGoal();
            if (onGoalChanged) onGoalChanged();
          }}
          onClose={() => setShowQueueModal(false)}
        />
      )}
    </div>
  );
}
