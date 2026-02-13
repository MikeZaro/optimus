import { useEffect, useState } from 'react';
import AppNav from './components/AppNav';
import { supabase } from './supabaseClient';
import './HabitsApp.css';

const API_URL = 'http://localhost:3001/api';

const parseResponseSafely = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return { error: text || `HTTP ${response.status}` };
};

const toDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTimeOfDayLabel = (value) => {
  const labels = {
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    anytime: 'Anytime',
  };
  return labels[value] || 'Anytime';
};

const getFrequencyLabel = (habit) => {
  if (habit.frequency_type === 'daily') return 'Daily';
  if (habit.frequency_type === 'weekly' && habit.frequency_config?.days) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = habit.frequency_config.days.map(d => dayNames[d]).join(', ');
    return `Weekly: ${days}`;
  }
  if (habit.frequency_type === 'custom') {
    return `${habit.frequency_config?.times_per_week || 3}x per week`;
  }
  return 'Custom';
};

function HabitsApp() {
  const [habits, setHabits] = useState([]);
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [selectedHabit, setSelectedHabit] = useState(null);
  const [completions, setCompletions] = useState([]);
  const [completionsLoading, setCompletionsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [checkInLoadingId, setCheckInLoadingId] = useState(null);

  // Form state for creating new habit
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitDescription, setNewHabitDescription] = useState('');
  const [newHabitFrequency, setNewHabitFrequency] = useState('daily');
  const [newHabitDays, setNewHabitDays] = useState([1, 2, 3, 4, 5]); // Mon-Fri
  const [newHabitTimeOfDay, setNewHabitTimeOfDay] = useState('anytime');
  const [newHabitArea, setNewHabitArea] = useState('personal');
  const [isSavingHabit, setIsSavingHabit] = useState(false);

  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    loadHabits();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel('habits-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'habits' },
        () => loadHabits()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'habit_completions' },
        () => loadHabits()
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedHabit) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [selectedHabit]);

  useEffect(() => {
    if (selectedHabit?.id) {
      loadCompletions(selectedHabit.id);
    }
  }, [selectedHabit?.id]);

  const loadHabits = async () => {
    try {
      const response = await fetch(`${API_URL}/habits?status=active`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load habits');
      }

      // Check today's completion status
      const todayStr = toDateString(today);
      const completionsRes = await fetch(`${API_URL}/habits/daily-checkin/${todayStr}`);
      const completionsData = await completionsRes.json();

      const completedIds = new Set(
        (completionsData.habits || [])
          .filter(h => h.completed_today)
          .map(h => h.id)
      );

      const enrichedHabits = (data.habits || []).map(habit => ({
        ...habit,
        completed_today: completedIds.has(habit.id),
      }));

      setHabits(enrichedHabits);
    } catch (error) {
      console.error('Error loading habits:', error);
    } finally {
      setHabitsLoading(false);
    }
  };

  const loadCompletions = async (habitId) => {
    setCompletionsLoading(true);
    try {
      const response = await fetch(`${API_URL}/habits/${habitId}/completions?limit=90`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load completions');
      }

      setCompletions(data.completions || []);
    } catch (error) {
      console.error('Error loading completions:', error);
      setCompletions([]);
    } finally {
      setCompletionsLoading(false);
    }
  };

  const handleCreateHabit = async (e) => {
    e.preventDefault();

    if (!newHabitTitle.trim()) {
      alert('Please enter a habit title');
      return;
    }

    setIsSavingHabit(true);

    try {
      const frequencyConfig =
        newHabitFrequency === 'weekly' ? { days: newHabitDays } : null;

      const response = await fetch(`${API_URL}/habits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newHabitTitle.trim(),
          description: newHabitDescription.trim() || null,
          frequency_type: newHabitFrequency,
          frequency_config: frequencyConfig,
          target_time_of_day: newHabitTimeOfDay,
          area: newHabitArea,
        }),
      });

      const data = await parseResponseSafely(response);

      if (!response.ok) {
        const details = typeof data?.error === 'string' ? data.error : JSON.stringify(data);
        throw new Error(`Failed to create habit (${response.status}): ${details}`);
      }

      // Reset form
      setNewHabitTitle('');
      setNewHabitDescription('');
      setNewHabitFrequency('daily');
      setNewHabitDays([1, 2, 3, 4, 5]);
      setNewHabitTimeOfDay('anytime');
      setNewHabitArea('personal');
      setShowCreateForm(false);

      // Reload habits
      await loadHabits();
    } catch (error) {
      console.error('Error creating habit:', error);
      alert(`Failed to create habit: ${error.message}`);
    } finally {
      setIsSavingHabit(false);
    }
  };

  const handleCheckIn = async (habitId) => {
    setCheckInLoadingId(habitId);

    try {
      const response = await fetch(`${API_URL}/habits/${habitId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood: 'good' }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          alert('You already checked in today!');
        } else {
          throw new Error(data?.error || 'Failed to check in');
        }
      } else {
        // Update local state
        await loadHabits();
      }
    } catch (error) {
      console.error('Error checking in:', error);
      alert(`Failed to check in: ${error.message}`);
    } finally {
      setCheckInLoadingId(null);
    }
  };

  const handleUndoCompletion = async (habitId, date) => {
    try {
      const response = await fetch(`${API_URL}/habits/${habitId}/completions/${date}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to undo completion');
      }

      // Reload completions and habits
      await loadCompletions(habitId);
      await loadHabits();
    } catch (error) {
      console.error('Error undoing completion:', error);
      alert(`Failed to undo: ${error.message}`);
    }
  };

  const handleArchiveHabit = async (habitId) => {
    if (!confirm('Are you sure you want to archive this habit?')) return;

    try {
      const response = await fetch(`${API_URL}/habits/${habitId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to archive habit');
      }

      setSelectedHabit(null);
      await loadHabits();
    } catch (error) {
      console.error('Error archiving habit:', error);
      alert(`Failed to archive: ${error.message}`);
    }
  };

  const toggleDay = (day) => {
    setNewHabitDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  return (
    <div className="habits-app">
      <AppNav currentApp="habits" />

      <div className="container">
        <header className="habits-header">
          <h1>Habit Tracker</h1>
          <p className="date">{formattedDate}</p>
        </header>

        <div className="habits-toolbar">
          <button
            className="habit-btn habit-btn-primary"
            onClick={() => setShowCreateForm(true)}
          >
            + New Habit
          </button>
        </div>

        <div className="habits-grid">
          {habitsLoading ? (
            <div className="habits-empty">Loading habits...</div>
          ) : habits.length === 0 ? (
            <div className="habits-empty">
              No habits yet. Click "+ New Habit" to get started!
            </div>
          ) : (
            habits.map((habit) => (
              <div key={habit.id} className="habit-card">
                <div className="habit-card-header">
                  <h3>{habit.title}</h3>
                  {habit.current_streak > 0 && (
                    <span className="habit-streak-badge">
                      🔥 {habit.current_streak}
                    </span>
                  )}
                </div>

                {habit.description && (
                  <p className="habit-description">{habit.description}</p>
                )}

                <div className="habit-meta">
                  <span className="habit-frequency">
                    {getFrequencyLabel(habit)}
                  </span>
                  {habit.target_time_of_day && habit.target_time_of_day !== 'anytime' && (
                    <span className="habit-time">
                      {getTimeOfDayLabel(habit.target_time_of_day)}
                    </span>
                  )}
                </div>

                <div className="habit-stats-mini">
                  <div className="stat-item">
                    <span className="stat-label">Longest</span>
                    <span className="stat-value">{habit.longest_streak} days</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">7-day rate</span>
                    <span className="stat-value">{habit.completion_rate_7day}%</span>
                  </div>
                </div>

                <div className="habit-actions">
                  {habit.completed_today ? (
                    <div className="habit-completed-indicator">
                      ✓ Completed today
                    </div>
                  ) : (
                    <button
                      className="habit-btn habit-btn-checkin"
                      onClick={() => handleCheckIn(habit.id)}
                      disabled={checkInLoadingId === habit.id}
                    >
                      {checkInLoadingId === habit.id ? 'Checking in...' : 'Check In'}
                    </button>
                  )}

                  <button
                    className="habit-btn habit-btn-details"
                    onClick={() => setSelectedHabit(habit)}
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Habit Modal */}
      {showCreateForm && (
        <div className="habit-modal-overlay" onClick={() => setShowCreateForm(false)}>
          <div className="habit-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button
              className="habit-modal-close"
              onClick={() => setShowCreateForm(false)}
            >
              ×
            </button>

            <h2>Create New Habit</h2>

            <form onSubmit={handleCreateHabit} className="habit-form">
              <div className="form-group">
                <label>Habit Title *</label>
                <input
                  type="text"
                  value={newHabitTitle}
                  onChange={(e) => setNewHabitTitle(e.target.value)}
                  placeholder="e.g., Morning meditation"
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newHabitDescription}
                  onChange={(e) => setNewHabitDescription(e.target.value)}
                  placeholder="Optional details about this habit..."
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label>Area</label>
                <select
                  value={newHabitArea}
                  onChange={(e) => setNewHabitArea(e.target.value)}
                >
                  <option value="personal">Personal</option>
                  <option value="work">Work</option>
                  <option value="education">Education</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div className="form-group">
                <label>Frequency *</label>
                <select
                  value={newHabitFrequency}
                  onChange={(e) => setNewHabitFrequency(e.target.value)}
                >
                  <option value="daily">Every day</option>
                  <option value="weekly">Specific days of the week</option>
                </select>
              </div>

              {newHabitFrequency === 'weekly' && (
                <div className="form-group">
                  <label>Days of the Week</label>
                  <div className="day-picker">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                      <button
                        key={day}
                        type="button"
                        className={`day-btn ${newHabitDays.includes(index) ? 'active' : ''}`}
                        onClick={() => toggleDay(index)}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Target Time</label>
                <select
                  value={newHabitTimeOfDay}
                  onChange={(e) => setNewHabitTimeOfDay(e.target.value)}
                >
                  <option value="anytime">Anytime</option>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="habit-btn habit-btn-secondary"
                  onClick={() => setShowCreateForm(false)}
                  disabled={isSavingHabit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="habit-btn habit-btn-primary"
                  disabled={isSavingHabit}
                >
                  {isSavingHabit ? 'Creating...' : 'Create Habit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Habit Details Modal */}
      {selectedHabit && (
        <div className="habit-modal-overlay" onClick={() => setSelectedHabit(null)}>
          <div className="habit-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button
              className="habit-modal-close"
              onClick={() => setSelectedHabit(null)}
            >
              ×
            </button>

            <h2>{selectedHabit.title}</h2>
            {selectedHabit.description && (
              <p className="habit-description-detail">{selectedHabit.description}</p>
            )}

            <div className="habit-stats-grid">
              <div className="stat-card">
                <div className="stat-icon">🔥</div>
                <div className="stat-content">
                  <div className="stat-label">Current Streak</div>
                  <div className="stat-value-large">{selectedHabit.current_streak}</div>
                  <div className="stat-unit">days</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🏆</div>
                <div className="stat-content">
                  <div className="stat-label">Longest Streak</div>
                  <div className="stat-value-large">{selectedHabit.longest_streak}</div>
                  <div className="stat-unit">days</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <div className="stat-label">30-Day Rate</div>
                  <div className="stat-value-large">{selectedHabit.completion_rate_30day}</div>
                  <div className="stat-unit">%</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-content">
                  <div className="stat-label">Total</div>
                  <div className="stat-value-large">{selectedHabit.total_completions}</div>
                  <div className="stat-unit">completions</div>
                </div>
              </div>
            </div>

            <section className="habit-detail-section">
              <h3>Recent Completions</h3>
              {completionsLoading ? (
                <p>Loading...</p>
              ) : completions.length > 0 ? (
                <div className="completions-list">
                  {completions.slice(0, 30).map((completion) => (
                    <div key={completion.id} className="completion-item">
                      <div className="completion-date">
                        {new Date(completion.completion_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      {completion.mood && (
                        <span className={`completion-mood mood-${completion.mood}`}>
                          {completion.mood}
                        </span>
                      )}
                      {completion.notes && (
                        <div className="completion-notes">{completion.notes}</div>
                      )}
                      <button
                        className="completion-undo"
                        onClick={() =>
                          handleUndoCompletion(selectedHabit.id, completion.completion_date)
                        }
                      >
                        Undo
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No completions yet</p>
              )}
            </section>

            <div className="habit-modal-actions">
              <button
                className="habit-btn habit-btn-danger"
                onClick={() => handleArchiveHabit(selectedHabit.id)}
              >
                Archive Habit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HabitsApp;
