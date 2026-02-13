import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import WatercolorHeatmapRow from './components/WatercolorHeatmapRow';
import MoodCheckin from './components/MoodCheckin';

const HEATMAP_COLORS = ['#FF6B6B', '#00D4FF', '#FFD60A', '#D81E5B', '#A2FF00'];

const toDateKeyLocal = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDateKey = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return toDateKeyLocal(date);
};

const buildTrailingDateKeys = (days) => {
  const keys = [];
  const today = new Date();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    keys.push(toDateKeyLocal(d));
  }

  return keys;
};

function App() {
  const [timeframe, setTimeframe] = useState('week');
  const [selectedDateKey, setSelectedDateKey] = useState(toDateKeyLocal(new Date()));
  const [habits, setHabits] = useState([]);
  const [completedByHabit, setCompletedByHabit] = useState({});
  const [consistencyLoading, setConsistencyLoading] = useState(true);

  const dateKeys = useMemo(
    () => (timeframe === 'week' ? buildTrailingDateKeys(7) : buildTrailingDateKeys(31)),
    [timeframe]
  );

  useEffect(() => {
    setSelectedDateKey(toDateKeyLocal(new Date()));
  }, []);

  useEffect(() => {
    const loadConsistency = async () => {
      setConsistencyLoading(true);
      try {
        let habitsData = [];
        const { data: activeHabits, error: activeHabitsError } = await supabase
          .from('habits')
          .select('id, title, status, created_at')
          .eq('status', 'active')
          .order('created_at', { ascending: true });

        if (activeHabitsError) {
          const { data: fallbackHabits, error: fallbackHabitsError } = await supabase
            .from('habits')
            .select('id, title, created_at')
            .order('created_at', { ascending: true });

          if (fallbackHabitsError) throw fallbackHabitsError;
          habitsData = fallbackHabits || [];
        } else {
          habitsData = activeHabits || [];
        }

        const todayKey = toDateKeyLocal(new Date());
        const since = new Date();
        since.setDate(since.getDate() - 120);
        const sinceKey = toDateKeyLocal(since);

        let logs = [];
        const { data: logsData, error: logsError } = await supabase
          .from('habits_logs')
          .select('habit_id, date, completed')
          .gte('date', sinceKey)
          .lte('date', todayKey);

        if (logsError) {
          const { data: completionsData, error: completionsError } = await supabase
            .from('habit_completions')
            .select('habit_id, completion_date, completed_at, created_at')
            .gte('completion_date', sinceKey);

          if (completionsError) {
            console.warn('[Consistency] habits_logs and habit_completions fallback both unavailable:', {
              logsError,
              completionsError,
            });
            logs = [];
          } else {
            logs = (completionsData || []).map((row) => ({
              habit_id: row.habit_id,
              date: row.completion_date || row.completed_at || row.created_at,
              completed: true,
            }));
          }
        } else {
          logs = logsData || [];
        }

        const completedMap = {};
        const usage = {};

        logs.forEach((log) => {
          const habitId = log.habit_id;
          const dateKey = normalizeDateKey(log.date);
          const completed = log.completed !== false;

          if (!habitId || !dateKey || !completed) return;

          if (!completedMap[habitId]) completedMap[habitId] = {};
          completedMap[habitId][dateKey] = true;
          usage[habitId] = (usage[habitId] || 0) + 1;
        });

        const sortedHabits = [...habitsData].sort((a, b) => {
          const byUsage = (usage[b.id] || 0) - (usage[a.id] || 0);
          if (byUsage !== 0) return byUsage;
          return (a.title || '').localeCompare(b.title || '');
        });

        setHabits(sortedHabits);
        setCompletedByHabit(completedMap);
      } catch (error) {
        console.error('Error loading consistency heatmap data:', error);
        setHabits([]);
        setCompletedByHabit({});
      } finally {
        setConsistencyLoading(false);
      }
    };

    loadConsistency();
  }, []);

  return (
    <div className="dashboard-watercolor">
      <nav>
        <ul className="nav-list">
          <li><a href="#" className="nav-item active">Dashboard</a></li>
          <li><a href="#" className="nav-item">Habits</a></li>
          <li><a href="#" className="nav-item">Health</a></li>
          <li><a href="#" className="nav-item">Claude Chat</a></li>
          <li><a href="#" className="nav-item">Calendar</a></li>
        </ul>
      </nav>

      <main>
        <h1 className="section-title">Today</h1>
        <MoodCheckin />

        <div className="dashboard-grid watercolor-grid">
          <button
            type="button"
            className="card card-clickable"
            onClick={() => { window.location.pathname = '/health'; }}
            aria-label="Open health dashboard and report"
          >
            <h2 className="section-title section-title-sm">Health</h2>
            <div className="metric-grid">
              <div className="metric">
                <div className="metric-value splash-value">0</div>
                <div className="metric-label">Steps</div>
              </div>
              <div className="metric">
                <div className="metric-value splash-value">0.0h</div>
                <div className="metric-label">Sleep</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            className="card card-clickable"
            onClick={() => { window.location.pathname = '/habits'; }}
            aria-label="Open habits dashboard"
          >
            <h2 className="section-title section-title-sm">Habits</h2>
            <p className="muted-text">Friday, February 13</p>
            <div className="habit-content">
              <strong>Play Guitar</strong>
              <p className="muted-text habit-description">Play with a metronome for 15 minutes</p>
              <button
                className="btn btn-primary btn-watercolor"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.pathname = '/habits';
                }}
              >
                + New Habit
              </button>
            </div>
          </button>

          <button
            type="button"
            className="card card-clickable"
            onClick={() => { window.location.pathname = '/goals-dashboard'; }}
            aria-label="Open goals dashboard"
          >
            <h2 className="section-title section-title-sm">Goals</h2>
            <p className="muted-text">All goals in one place</p>
            <div className="metric">
              <div className="metric-value splash-value">18%</div>
              <div className="metric-label">Weekly Progress</div>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: '18%' }} />
            </div>
          </button>
        </div>

        <section className="card consistency-section">
          <div className="consistency-header">
            <h2 className="section-title section-title-sm consistency-title">Consistency</h2>
            <div className="consistency-tabs" role="tablist" aria-label="Consistency timeframe">
              <button
                type="button"
                className={`consistency-tab ${timeframe === 'week' ? 'active' : ''}`}
                onClick={() => setTimeframe('week')}
              >
                This Week
              </button>
              <button
                type="button"
                className={`consistency-tab ${timeframe === 'month' ? 'active' : ''}`}
                onClick={() => setTimeframe('month')}
              >
                This Month
              </button>
            </div>
          </div>

          {consistencyLoading ? (
            <p className="muted-text">Loading consistency...</p>
          ) : habits.length === 0 ? (
            <p className="muted-text">No active habits yet. Create one to start your heatmap.</p>
          ) : (
            <div className="consistency-rows">
              {habits.map((habit, idx) => (
                <WatercolorHeatmapRow
                  key={habit.id}
                  habitName={habit.title}
                  dateKeys={dateKeys}
                  completedByDate={completedByHabit[habit.id] || {}}
                  color={HEATMAP_COLORS[idx % HEATMAP_COLORS.length]}
                  selectedDateKey={selectedDateKey}
                  onSelectDate={setSelectedDateKey}
                  timeframe={timeframe}
                />
              ))}
            </div>
          )}
        </section>

        <div className="assistant-wrap card">
          <input
            className="assistant-input"
            type="text"
            placeholder="Type a message to the AI assistant..."
          />
        </div>
      </main>
    </div>
  );
}

export default App;


