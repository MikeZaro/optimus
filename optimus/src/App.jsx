import { useEffect, useState } from 'react';
import './App.css';
import { supabase } from './supabaseClient';
import AppNav from './components/AppNav';
import DailyInput from './components/DailyInput';
import HabitStatusCard from './components/HabitStatusCard';
import HabitTile from './components/HabitTile';
import StreakHealthBar from './components/StreakHealthBar';
import GoalStatusCard from './components/GoalStatusCard';
import GoalTile from './components/GoalTile';
import GoalProgressBar from './components/GoalProgressBar';
import HealthDashboardCard from './components/HealthDashboardCard';
import HeightWeightCard from './components/HeightWeightCard';

const API_URL = 'http://localhost:3001/api';

const QUOTES = [
  { text: 'The future is already here. It is just not evenly distributed.', author: 'William Gibson', tags: ['technology', 'future', 'innovation'] },
  { text: 'The best way to predict the future is to invent it.', author: 'Alan Kay', tags: ['technology', 'innovation', 'creation'] },
  { text: 'It is not a daily increase, but a daily decrease. Hack away at the inessentials.', author: 'Bruce Lee', tags: ['focus', 'discipline'] },
  { text: 'First, solve the problem. Then, write the code.', author: 'John Johnson', tags: ['technology', 'focus'] },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear', tags: ['discipline', 'systems'] },
  { text: 'Success is the product of daily habits, not once-in-a-lifetime transformations.', author: 'James Clear', tags: ['discipline', 'consistency'] },
  { text: 'The man who moves a mountain begins by carrying away small stones.', author: 'Confucius', tags: ['consistency', 'resilience'] },
  { text: 'Stay hungry, stay foolish.', author: 'Steve Jobs', tags: ['entrepreneurship', 'innovation'] },
  { text: 'What gets measured gets managed.', author: 'Peter Drucker', tags: ['systems', 'execution'] },
  { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci', tags: ['focus', 'craft'] },
  { text: 'The impediment to action advances action. What stands in the way becomes the way.', author: 'Marcus Aurelius', tags: ['resilience', 'focus'] },
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant', tags: ['discipline', 'consistency'] },
  { text: 'When something is important enough, you do it even if the odds are not in your favor.', author: 'Elon Musk', tags: ['resilience', 'entrepreneurship'] },
  { text: 'Action is the foundational key to all success.', author: 'Pablo Picasso', tags: ['execution', 'creativity'] },
  { text: 'Tell me and I forget. Teach me and I remember. Involve me and I learn.', author: 'Benjamin Franklin', tags: ['learning', 'education'] },
  { text: 'Learning never exhausts the mind.', author: 'Leonardo da Vinci', tags: ['learning', 'education'] },
  { text: 'The quieter you become, the more you are able to hear.', author: 'Rumi', tags: ['wellbeing', 'focus'] },
  { text: 'Almost everything will work again if you unplug it for a few minutes, including you.', author: 'Anne Lamott', tags: ['wellbeing', 'resilience'] },
  { text: 'Ideas are easy. Implementation is hard.', author: 'Guy Kawasaki', tags: ['execution', 'technology'] },
  { text: 'Do not confuse motion with progress.', author: 'Denzel Washington', tags: ['focus', 'execution'] },
];

const KEYWORD_TO_TAG = [
  { words: ['app', 'build', 'code', 'api', 'software', 'tech', 'engineering', 'program'], tag: 'technology' },
  { words: ['learn', 'study', 'course', 'education', 'ai', 'guitar', 'practice'], tag: 'learning' },
  { words: ['habit', 'routine', 'daily', 'consisten', 'discipline'], tag: 'discipline' },
  { words: ['focus', 'priority', 'prioritize', 'clarity', 'deep work'], tag: 'focus' },
  { words: ['stress', 'health', 'meal', 'sleep', 'wellness', 'personal'], tag: 'wellbeing' },
  { words: ['founder', 'startup', 'business', 'ship', 'launch'], tag: 'entrepreneurship' },
  { words: ['stuck', 'hard', 'blocked', 'difficult', 'struggle'], tag: 'resilience' },
  { words: ['execute', 'finish', 'ship', 'done', 'deliver'], tag: 'execution' },
];

const hashString = (input) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const inferTopTag = (texts) => {
  const score = {};
  KEYWORD_TO_TAG.forEach(({ tag }) => { score[tag] = 0; });

  texts.forEach((rawText) => {
    const text = (rawText || '').toLowerCase();
    KEYWORD_TO_TAG.forEach(({ words, tag }) => {
      if (words.some((word) => text.includes(word))) {
        score[tag] += 1;
      }
    });
  });

  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[1] > 0 ? ranked[0][0] : null;
};

const pickDailyQuote = (topTag) => {
  const todayKey = new Date().toISOString().slice(0, 10);
  const pool = topTag ? QUOTES.filter((q) => q.tags.includes(topTag)) : QUOTES;
  const selectedPool = pool.length > 0 ? pool : QUOTES;
  const index = hashString(`${todayKey}:${topTag || 'general'}`) % selectedPool.length;
  return selectedPool[index];
};

const toDateKey = (value) => new Date(value).toISOString().slice(0, 10);

const calculateCompletionStreak = (tasks) => {
  const completionDays = Array.from(
    new Set(
      (tasks || [])
        .filter((task) => task.completed_at)
        .map((task) => toDateKey(task.completed_at))
    )
  ).sort((a, b) => (a > b ? -1 : 1));

  if (completionDays.length === 0) return 0;

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < completionDays.length; i += 1) {
    const expected = new Date(cursor);
    expected.setDate(cursor.getDate() - i);
    if (completionDays[i] === toDateKey(expected)) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
};

function App() {
  const [goals, setGoals] = useState([]);
  const [quoteOfDay, setQuoteOfDay] = useState(pickDailyQuote(null));
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalActionLoadingId, setGoalActionLoadingId] = useState(null);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [selectedGoalTasks, setSelectedGoalTasks] = useState([]);
  const [selectedGoalLoading, setSelectedGoalLoading] = useState(false);
  const [selectedGoalReloadTick, setSelectedGoalReloadTick] = useState(0);
  const [showCompletedGoalsModal, setShowCompletedGoalsModal] = useState(false);
  const [showActiveGoalsModal, setShowActiveGoalsModal] = useState(false);
  const [taskActionLoadingId, setTaskActionLoadingId] = useState(null);
  const [newTaskDraft, setNewTaskDraft] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [limitingFactorDraft, setLimitingFactorDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [isSavingLimitingFactor, setIsSavingLimitingFactor] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Habits state
  const [todayHabits, setTodayHabits] = useState([]);
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [checkInLoadingId, setCheckInLoadingId] = useState(null);

  // Health state
  const [todayHealth, setTodayHealth] = useState({});
  const [healthLoading, setHealthLoading] = useState(true);

  // Height and Weight state (stored locally for now)
  const [userHeight, setUserHeight] = useState(null); // e.g., "5'10\"" or "178 cm"
  const [userWeight, setUserWeight] = useState(null); // e.g., "165 lbs" or "75 kg"

  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    loadGoals();
    loadQuoteOfDay();
    loadTodayHabits();
    loadTodayHealth();

    const subscription = supabase
      .channel('app-goals')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goals' },
        () => loadGoals()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'habits' },
        () => loadTodayHabits()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'habit_completions' },
        () => loadTodayHabits()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'health_data' },
        () => loadTodayHealth()
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedGoal) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [selectedGoal]);

  useEffect(() => {
    if (!selectedGoal?.id) {
      setSelectedGoalTasks([]);
      setLimitingFactorDraft('');
      setSelectedGoalLoading(false);
      return undefined;
    }

    let cancelled = false;

    const loadSelectedGoalData = async () => {
      setSelectedGoalLoading(true);
      // Reset state immediately so switching goals cannot show stale data.
      setSelectedGoalTasks([]);
      setLimitingFactorDraft('');

      console.log('[GoalModal] selectedGoal.id:', selectedGoal.id);

      try {
        const [{ data: tasksData, error: tasksError }, { data: limitingFactorsData, error: limitingFactorsError }] = await Promise.all([
          supabase
            .from('tasks')
            .select('*')
            .eq('goal_id', selectedGoal.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('bottlenecks')
            .select('id, area, goal_id, description, detected_at, resolved_at')
            .eq('goal_id', selectedGoal.id)
            .order('detected_at', { ascending: false }),
        ]);

        console.log('[GoalModal] tasks response:', { goalId: selectedGoal.id, tasksData, tasksError });
        console.log('[GoalModal] limiting factors response:', { goalId: selectedGoal.id, limitingFactorsData, limitingFactorsError });

        if (tasksError) throw tasksError;
        if (limitingFactorsError) throw limitingFactorsError;
        if (cancelled) return;

        setSelectedGoalTasks(tasksData || []);
        setLimitingFactorDraft((limitingFactorsData?.[0]?.description || '').trim());
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading selected goal modal data:', error);
        setSelectedGoalTasks([]);
        setLimitingFactorDraft('');
      } finally {
        if (!cancelled) {
          setSelectedGoalLoading(false);
        }
      }
    };

    loadSelectedGoalData();
    return () => {
      cancelled = true;
    };
  }, [selectedGoal?.id, selectedGoalReloadTick]);

  const loadQuoteOfDay = async () => {
    try {
      const { data: goalsData } = await supabase
        .from('goals')
        .select('title, area, status')
        .in('status', ['active', 'paused'])
        .order('created_at', { ascending: false })
        .limit(12);

      const { data: tasksData } = await supabase
        .from('tasks')
        .select('content, source')
        .order('created_at', { ascending: false })
        .limit(24);

      const { data: chatData } = await supabase
        .from('chat_messages')
        .select('content, role')
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(20);

      const textSignals = [
        ...(goalsData || []).map((g) => `${g.area} ${g.title}`),
        ...(tasksData || []).map((t) => t.content),
        ...(chatData || []).map((m) => m.content),
      ];

      const topTag = inferTopTag(textSignals);
      setQuoteOfDay(pickDailyQuote(topTag));
    } catch (error) {
      console.error('Error loading quote of the day:', error);
      setQuoteOfDay(pickDailyQuote(null));
    }
  };

  const toTitleCase = (value) => {
    return (value || '')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const loadGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGoals(data || []);
    } catch (error) {
      console.error('Error loading goals:', error);
    } finally {
      setGoalsLoading(false);
    }
  };

  const openGoalDetails = (goal) => {
    setSelectedGoal(goal);
    setDescriptionDraft(goal.description || '');
    setLimitingFactorDraft('');
    setNotesDraft(goal.notes || '');

    // Trigger AI generation on open only for missing tasks.
    fetch(`${API_URL}/goals/ensure-ai/${goal.id}`, { method: 'POST' })
      .then((response) => response.json())
      .then((data) => {
        console.log('[GoalModal] ensure-ai response:', { goalId: goal.id, data });
        setSelectedGoalReloadTick((prev) => prev + 1);
      })
      .catch((error) => {
        console.error('[GoalModal] ensure-ai failed:', { goalId: goal.id, error });
      });
  };

  const saveLimitingFactor = async () => {
    if (!selectedGoal?.id) return;
    setIsSavingLimitingFactor(true);

    try {
      const text = limitingFactorDraft.trim();
      const { data: existing, error: existingError } = await supabase
        .from('bottlenecks')
        .select('id')
        .eq('goal_id', selectedGoal.id)
        .order('detected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingError) throw existingError;

      if (!text) {
        if (existing?.id) {
          const { error: clearError } = await supabase
            .from('bottlenecks')
            .update({
              description: '',
              detected_at: new Date().toISOString(),
              resolved_at: null,
            })
            .eq('id', existing.id);
          if (clearError) throw clearError;
        }
      } else if (existing?.id) {
        const { error: updateError } = await supabase
          .from('bottlenecks')
          .update({
            description: text,
            detected_at: new Date().toISOString(),
            resolved_at: null,
          })
          .eq('id', existing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('bottlenecks')
          .insert({
            area: selectedGoal.area || 'work',
            goal_id: selectedGoal.id,
            bottleneck_type: 'prioritization',
            severity: 5,
            description: text,
            detected_at: new Date().toISOString(),
            resolved_at: null,
          });
        if (insertError) throw insertError;
      }

      setSelectedGoalReloadTick((prev) => prev + 1);
    } catch (error) {
      console.error('Error saving limiting factor:', error);
      window.alert('Failed to save limiting factor. Please try again.');
    } finally {
      setIsSavingLimitingFactor(false);
    }
  };

  const saveGoalField = async (field, value) => {
    if (!selectedGoal) return;

    const nextValue = value?.trim() ? value.trim() : null;
    if ((selectedGoal[field] || null) === nextValue) return;

    if (field === 'description') setIsSavingDescription(true);
    if (field === 'notes') setIsSavingNotes(true);

    try {
      const { error } = await supabase
        .from('goals')
        .update({ [field]: nextValue })
        .eq('id', selectedGoal.id);

      if (error) throw error;

      setSelectedGoal((prev) => (prev ? { ...prev, [field]: nextValue } : prev));
      setGoals((prevGoals) => prevGoals.map((goal) => (
        goal.id === selectedGoal.id ? { ...goal, [field]: nextValue } : goal
      )));
    } catch (error) {
      console.error(`Error saving goal ${field}:`, error);
      window.alert(`Failed to save ${field}. Please try again.`);
    } finally {
      if (field === 'description') setIsSavingDescription(false);
      if (field === 'notes') setIsSavingNotes(false);
    }
  };

  const handleTaskOutcome = async (taskId, outcome) => {
    if (!selectedGoal?.id) return;
    setTaskActionLoadingId(taskId);
    try {
      const payload = outcome === 'complete'
        ? { completed_at: new Date().toISOString(), skipped_at: null }
        : { skipped_at: new Date().toISOString(), completed_at: null };

      const { error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', taskId);

      if (error) throw error;
      setSelectedGoalReloadTick((prev) => prev + 1);
    } catch (error) {
      console.error(`Error updating task as ${outcome}:`, error);
      window.alert(`Failed to mark task as ${outcome}. Please try again.`);
    } finally {
      setTaskActionLoadingId(null);
    }
  };

  const handleAddTask = async () => {
    if (!selectedGoal?.id) return;
    const content = newTaskDraft.trim();
    if (!content) return;

    setIsAddingTask(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .insert({
          goal_id: selectedGoal.id,
          area: selectedGoal.area || 'work',
          content,
          source: 'user_added',
          presented_at: new Date().toISOString(),
        });

      if (error) throw error;
      setNewTaskDraft('');
      setSelectedGoalReloadTick((prev) => prev + 1);
    } catch (error) {
      console.error('Error adding custom task:', error);
      window.alert('Failed to add task. Please try again.');
    } finally {
      setIsAddingTask(false);
    }
  };

  const loadTodayHabits = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const habitsResponse = await fetch(`${API_URL}/habits?status=active`);
      const habitsData = await habitsResponse.json();

      if (!habitsResponse.ok) {
        throw new Error(habitsData?.error || 'Failed to load active habits');
      }

      let dailyData = { habits: [] };
      try {
        const dailyResponse = await fetch(`${API_URL}/habits/daily-checkin/${todayStr}`);
        const parsedDaily = await dailyResponse.json();
        if (dailyResponse.ok) {
          dailyData = parsedDaily;
        } else {
          console.warn('Daily check-in status unavailable, showing habits without completion state:', parsedDaily?.error || dailyResponse.status);
        }
      } catch (dailyError) {
        console.warn('Daily check-in request failed, showing habits without completion state:', dailyError);
      }

      const completedTodayIds = new Set(
        (dailyData.habits || [])
          .filter((habit) => habit.completed_today)
          .map((habit) => habit.id)
      );

      const enrichedHabits = (habitsData.habits || []).map((habit) => ({
        ...habit,
        completed_today: completedTodayIds.has(habit.id),
      }));

      setTodayHabits(enrichedHabits);
    } catch (error) {
      console.error('Error loading habits:', error);
      setTodayHabits([]);
    } finally {
      setHabitsLoading(false);
    }
  };

  const loadTodayHealth = async () => {
    try {
      const response = await fetch(`${API_URL}/health/daily`);
      const data = await response.json();
      if (response.ok) {
        setTodayHealth(data);
      }
    } catch (error) {
      console.error('Error loading health data:', error);
    } finally {
      setHealthLoading(false);
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
        await loadTodayHabits();
      }
    } catch (error) {
      console.error('Error checking in:', error);
      alert(`Failed to check in: ${error.message}`);
    } finally {
      setCheckInLoadingId(null);
    }
  };

  const handleAddGoal = async () => {
    const goalText = window.prompt('Enter your goal');
    if (!goalText || !goalText.trim()) return;
    const area = 'work';

    try {
      const { data: insertedGoal, error } = await supabase
        .from('goals')
        .insert({
          title: goalText.trim(),
          area,
          status: 'active',
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;

      if (insertedGoal?.id) {
        fetch(`${API_URL}/goals/ensure-ai/${insertedGoal.id}`, { method: 'POST' })
          .then((response) => response.json())
          .then((data) => {
            console.log('[GoalCreate] ensure-ai response:', { goalId: insertedGoal.id, data });
          })
          .catch((ensureError) => {
            console.error('[GoalCreate] ensure-ai failed:', { goalId: insertedGoal.id, error: ensureError });
          });
      }
      await loadGoals();
    } catch (error) {
      console.error('Error adding goal:', error);
      window.alert('Failed to add goal. Please try again.');
    }
  };

  const handleCompleteGoal = async (goalId) => {
    const notes = window.prompt('Add completion notes') || '';
    setGoalActionLoadingId(goalId);

    try {
      const { error } = await supabase
        .from('goals')
        .update({
          status: 'completed',
          completion_notes: notes,
          incomplete_reason: null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', goalId);

      if (error) throw error;
      await loadGoals();
    } catch (error) {
      console.error('Error completing goal:', error);
      window.alert('Failed to complete goal. Please try again.');
    } finally {
      setGoalActionLoadingId(null);
    }
  };

  const handleIncompleteGoal = async (goalId) => {
    const reason = window.prompt('Why could you not complete this goal?') || '';
    setGoalActionLoadingId(goalId);

    try {
      const { error } = await supabase
        .from('goals')
        .update({
          status: 'incomplete',
          incomplete_reason: reason,
          completion_notes: null,
        })
        .eq('id', goalId);

      if (error) throw error;
      await loadGoals();
    } catch (error) {
      console.error('Error marking goal incomplete:', error);
      window.alert('Failed to update goal. Please try again.');
    } finally {
      setGoalActionLoadingId(null);
    }
  };

  const completedTaskCount = selectedGoalTasks.filter((task) => Boolean(task.completed_at)).length;
  const skippedTaskCount = selectedGoalTasks.filter((task) => Boolean(task.skipped_at)).length;
  const openTaskCount = selectedGoalTasks.filter((task) => !task.completed_at && !task.skipped_at).length;
  const scoredTaskCount = completedTaskCount + skippedTaskCount;
  const completionRate = scoredTaskCount > 0 ? Math.round((completedTaskCount / scoredTaskCount) * 100) : 0;
  const streakDays = calculateCompletionStreak(selectedGoalTasks);
  const xpPoints = (completedTaskCount * 20) - (skippedTaskCount * 5);
  const level = Math.max(1, Math.floor(Math.max(0, xpPoints) / 100) + 1);
  const tierLabel = completionRate >= 80 ? 'Elite Focus' : completionRate >= 50 ? 'Builder Mode' : 'Momentum Start';
  const completedGoalsChronological = goals
    .filter((goal) => goal.status === 'completed')
    .sort((a, b) => new Date(a.completed_at || a.created_at) - new Date(b.completed_at || b.created_at));
  const activeGoalsChronological = goals
    .filter((goal) => goal.status === 'active')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return (
    <div className="app">
      <AppNav currentApp="dashboard" />

      <div className="container">
        <header className="app-header">
          <h1>Optimus AI Task Curator</h1>
          <p className="date">{formattedDate}</p>
          <div className="principle">
            <p className="quote-text">"{quoteOfDay.text}"</p>
            <p className="quote-author">- {quoteOfDay.author}</p>
          </div>
        </header>

        <DailyInput />

        {/* Goals Section - Duolingo Style */}
        <div className="goals-dashboard-section">
          {/* Status Card */}
          <GoalStatusCard
            goals={goals}
            onOpenDashboard={() => { window.location.pathname = '/goals-dashboard'; }}
          />

          {/* Progress Bar */}
          {goals.length > 0 && (
            <GoalProgressBar
              goals={goals}
              onOpenActiveGoals={() => setShowActiveGoalsModal(true)}
              onOpenCompletedGoals={() => setShowCompletedGoalsModal(true)}
            />
          )}

          {/* Goal Tiles */}
          <div className="goal-tiles-container">
            {goalsLoading ? (
              <div className="goals-loading">Loading goals...</div>
            ) : (
              <>
                {goals
                  .filter(g => g.status === 'active')
                  .map((goal, index) => (
                    <GoalTile
                      key={goal.id}
                      goal={goal}
                      cardNumber={index + 1}
                      onOpen={openGoalDetails}
                      onComplete={handleCompleteGoal}
                      onIncomplete={handleIncompleteGoal}
                      isLoading={goalActionLoadingId === goal.id}
                    />
                  ))}

                {/* Add Goal Card */}
                <div className="add-goal-card" onClick={handleAddGoal}>
                  <div className="add-goal-icon">+</div>
                  <h3 className="add-goal-text">Add New Goal</h3>
                  <p className="add-goal-subtext">Set a new objective</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Habits Section - Duolingo Style */}
        <div className="habits-dashboard-section">
          <div className="habits-section-header">
            <h2>Today's Habits</h2>
            <button
              className="habit-view-all-btn"
              onClick={() => window.location.pathname = '/habits'}
            >
              View All →
            </button>
          </div>

          {/* Status Card */}
          <HabitStatusCard
            habits={todayHabits}
            onStartHabits={() => window.location.pathname = '/habits'}
          />

          {/* Streak Health Bar */}
          {todayHabits.length > 0 && (
            <StreakHealthBar habits={todayHabits} />
          )}

          {/* Habit Tiles */}
          <div className="habit-tiles-container">
            {habitsLoading ? (
              <div className="habits-loading">Loading habits...</div>
            ) : todayHabits.length > 0 ? (
              todayHabits.slice(0, 8).map((habit) => (
                <HabitTile
                  key={habit.id}
                  habit={habit}
                  onComplete={handleCheckIn}
                  isLoading={checkInLoadingId === habit.id}
                />
              ))
            ) : null}
          </div>
        </div>

        {/* Health Dashboard Section */}
        <div className="health-dashboard-section">
          <div className="health-section-header">
            <h2>Health Metrics</h2>
          </div>

          {/* 2-column grid */}
          <div className="health-cards-grid">
            {/* Left column: Main health card */}
            <HealthDashboardCard
              healthData={todayHealth}
              onViewHealth={() => window.location.pathname = '/health'}
            />

            {/* Right column: Stacked height/weight cards */}
            <div className="height-weight-stack">
              <HeightWeightCard
                type="height"
                value={userHeight}
                unit=""
                onEdit={() => {
                  const newHeight = prompt('Enter your height (e.g., 5\'10" or 178 cm):');
                  if (newHeight) setUserHeight(newHeight);
                }}
              />
              <HeightWeightCard
                type="weight"
                value={userWeight}
                unit=""
                onEdit={() => {
                  const newWeight = prompt('Enter your weight (e.g., 165 lbs or 75 kg):');
                  if (newWeight) setUserWeight(newWeight);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {selectedGoal && (
        <div className="goal-modal-overlay" onClick={() => setSelectedGoal(null)}>
          <div className="goal-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="goal-modal-close" onClick={() => setSelectedGoal(null)}>
              X
            </button>

            <h2>{toTitleCase(selectedGoal.title)}</h2>
            <section className="goal-modal-gameboard">
              <div className="goal-hud-grid">
                <div className="goal-hud-card">
                  <div className="goal-hud-label">Level</div>
                  <div className="goal-hud-value">Lv {level}</div>
                </div>
                <div className="goal-hud-card">
                  <div className="goal-hud-label">XP</div>
                  <div className="goal-hud-value">{Math.max(0, xpPoints)}</div>
                </div>
                <div className="goal-hud-card">
                  <div className="goal-hud-label">Streak</div>
                  <div className="goal-hud-value">{streakDays} day{streakDays === 1 ? '' : 's'}</div>
                </div>
                <div className="goal-hud-card">
                  <div className="goal-hud-label">Tier</div>
                  <div className="goal-hud-value">{tierLabel}</div>
                </div>
              </div>
              <div className="goal-progress-track">
                <div className="goal-progress-fill" style={{ width: `${completionRate}%` }} />
              </div>
              <div className="goal-progress-meta">
                <span>{completionRate}% completion rate</span>
                <span>{completedTaskCount} done • {openTaskCount} open • {skippedTaskCount} skipped</span>
              </div>
            </section>

            <section className="goal-modal-section">
              <h3>Description</h3>
              <textarea
                className="goal-modal-textarea"
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onBlur={() => saveGoalField('description', descriptionDraft)}
                placeholder="Describe what success looks like for this goal..."
                rows={4}
              />
              <button
                type="button"
                className="goal-btn goal-btn-primary goal-modal-save-btn"
                onClick={() => saveGoalField('description', descriptionDraft)}
                disabled={isSavingDescription}
              >
                {isSavingDescription ? 'Saving...' : 'Save Description'}
              </button>
            </section>

            <section className="goal-modal-section">
              <h3>Limiting Factor</h3>
              <textarea
                className="goal-modal-textarea"
                value={limitingFactorDraft}
                onChange={(e) => setLimitingFactorDraft(e.target.value)}
                placeholder="What is currently slowing you down or blocking progress?"
                rows={5}
              />
              <button
                type="button"
                className="goal-btn goal-btn-primary goal-modal-save-btn"
                onClick={saveLimitingFactor}
                disabled={selectedGoalLoading || isSavingLimitingFactor}
              >
                {isSavingLimitingFactor ? 'Saving...' : 'Save Limiting Factor'}
              </button>
            </section>

            <section className="goal-modal-section">
              <h3>Tasks</h3>
              <div className="goal-modal-add-task-row">
                <input
                  type="text"
                  className="goal-modal-task-input"
                  value={newTaskDraft}
                  onChange={(e) => setNewTaskDraft(e.target.value)}
                  placeholder="Create A Task"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTask();
                    }
                  }}
                />
                <button
                  type="button"
                  className="goal-btn goal-btn-primary"
                  onClick={handleAddTask}
                  disabled={isAddingTask || !newTaskDraft.trim()}
                >
                  {isAddingTask ? 'Adding...' : 'Add'}
                </button>
              </div>
              {selectedGoalLoading ? (
                <p>Loading...</p>
              ) : selectedGoalTasks.length > 0 ? (
                <div className="goal-modal-task-list">
                  {selectedGoalTasks.map((task) => (
                    <div key={task.id} className="goal-modal-task-item">
                      <div className="goal-modal-task-content">{task.content}</div>
                      <div className="goal-modal-task-meta">
                        {task.completed_at && <span className="goal-task-status complete">Completed</span>}
                        {task.skipped_at && <span className="goal-task-status skipped">Skipped</span>}
                      </div>
                      {!task.completed_at && !task.skipped_at && (
                        <div className="goal-modal-task-actions">
                          <button
                            type="button"
                            className="goal-btn goal-btn-complete"
                            onClick={() => handleTaskOutcome(task.id, 'complete')}
                            disabled={taskActionLoadingId === task.id}
                          >
                            {taskActionLoadingId === task.id ? 'Saving...' : 'Complete'}
                          </button>
                          <button
                            type="button"
                            className="goal-btn goal-btn-secondary"
                            onClick={() => handleTaskOutcome(task.id, 'skip')}
                            disabled={taskActionLoadingId === task.id}
                          >
                            {taskActionLoadingId === task.id ? 'Saving...' : 'Skip'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p>No tasks yet.</p>
              )}
            </section>

            <section className="goal-modal-section">
              <h3>Notes</h3>
              <textarea
                className="goal-modal-textarea"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={() => saveGoalField('notes', notesDraft)}
                placeholder="Track progress, blockers, reflections, and updates..."
                rows={6}
              />
              <button
                type="button"
                className="goal-btn goal-btn-primary goal-modal-save-btn"
                onClick={() => saveGoalField('notes', notesDraft)}
                disabled={isSavingNotes}
              >
                {isSavingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </section>

            <div className="goal-modal-actions">
              <button
                className="goal-btn goal-btn-complete"
                onClick={async () => {
                  await handleCompleteGoal(selectedGoal.id);
                  setSelectedGoal(null);
                }}
                disabled={goalActionLoadingId === selectedGoal.id}
              >
                Complete
              </button>
              <button
                className="goal-btn goal-btn-secondary"
                onClick={async () => {
                  await handleIncompleteGoal(selectedGoal.id);
                  setSelectedGoal(null);
                }}
                disabled={goalActionLoadingId === selectedGoal.id}
              >
                Incomplete
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompletedGoalsModal && (
        <div className="goal-modal-overlay" onClick={() => setShowCompletedGoalsModal(false)}>
          <div className="completed-goals-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="goal-modal-close" onClick={() => setShowCompletedGoalsModal(false)}>
              X
            </button>

            <h2>Completed Goals</h2>
            {completedGoalsChronological.length === 0 ? (
              <p>No completed goals yet.</p>
            ) : (
              <div className="completed-goals-list">
                {completedGoalsChronological.map((goal, index) => (
                  <button
                    key={goal.id}
                    type="button"
                    className="completed-goal-item completed-goal-item-clickable"
                    onClick={() => {
                      setShowCompletedGoalsModal(false);
                      openGoalDetails(goal);
                    }}
                  >
                    <div className="completed-goal-index">{index + 1}</div>
                    <div className="completed-goal-main">
                      <h3>{toTitleCase(goal.title)}</h3>
                      <p>
                        Completed:{' '}
                        {goal.completed_at
                          ? new Date(goal.completed_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })
                          : 'Date unavailable'}
                      </p>
                      {goal.completion_notes && <div className="completed-goal-notes">{goal.completion_notes}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showActiveGoalsModal && (
        <div className="goal-modal-overlay" onClick={() => setShowActiveGoalsModal(false)}>
          <div className="completed-goals-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="goal-modal-close" onClick={() => setShowActiveGoalsModal(false)}>
              X
            </button>

            <h2>Active Goals</h2>
            {activeGoalsChronological.length === 0 ? (
              <p>No active goals yet.</p>
            ) : (
              <div className="completed-goals-list">
                {activeGoalsChronological.map((goal, index) => (
                  <button
                    key={goal.id}
                    type="button"
                    className="completed-goal-item completed-goal-item-clickable"
                    onClick={() => {
                      setShowActiveGoalsModal(false);
                      openGoalDetails(goal);
                    }}
                  >
                    <div className="completed-goal-index">{index + 1}</div>
                    <div className="completed-goal-main">
                      <h3>{toTitleCase(goal.title)}</h3>
                      <p>
                        Created:{' '}
                        {goal.created_at
                          ? new Date(goal.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })
                          : 'Date unavailable'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
