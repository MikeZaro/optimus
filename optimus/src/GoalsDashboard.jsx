import { useEffect, useState } from 'react';
import AppNav from './components/AppNav';
import { supabase } from './supabaseClient';
import './GoalsDashboard.css';

const API_URL = 'http://localhost:3001/api';

function GoalsDashboard() {
  const [goals, setGoals] = useState([]);
  const [tasksByGoal, setTasksByGoal] = useState({});
  const [statusStats, setStatusStats] = useState({
    totalActiveGoals: 0,
    goalsDueToday: 0,
    weeklyProgressPercent: 0,
  });
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTasksGroupedByGoal = async (goalIds) => {
    if (!goalIds || goalIds.length === 0) return {};

    const { data: tasksData, error: tasksError } = await supabase
      .from('tasks')
      .select('id, goal_id, content, sequence_position, created_at, presented_at, completed_at, skipped_at')
      .in('goal_id', goalIds);

    if (tasksError) throw tasksError;

    const tasks = tasksData || [];
    return tasks.reduce((acc, task) => {
      if (!acc[task.goal_id]) acc[task.goal_id] = [];
      acc[task.goal_id].push(task);
      return acc;
    }, {});
  };

  const getGoalPercent = (goalId) => {
    const goalTasks = tasksByGoal[goalId] || [];
    if (goalTasks.length === 0) return 0;
    const completedCount = goalTasks.filter((task) => Boolean(task.completed_at)).length;
    return Math.round((completedCount / goalTasks.length) * 100);
  };

  const getGoalNextStep = (goalId) => {
    const goalTasks = tasksByGoal[goalId] || [];
    if (goalTasks.length === 0) return 'No tasks yet.';

    const openTasks = goalTasks
      .filter((task) => !task.completed_at && !task.skipped_at)
      .sort((a, b) => {
        const aSeq = typeof a.sequence_position === 'number' ? a.sequence_position : Number.MAX_SAFE_INTEGER;
        const bSeq = typeof b.sequence_position === 'number' ? b.sequence_position : Number.MAX_SAFE_INTEGER;
        if (aSeq !== bSeq) return aSeq - bSeq;
        return new Date(a.created_at) - new Date(b.created_at);
      });

    if (openTasks.length > 0) {
      return openTasks[0].content || 'No task content available.';
    }

    const latestTask = [...goalTasks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    return latestTask?.content || 'No task content available.';
  };

  const sendAssistantMessage = async () => {
    const userText = assistantInput.trim();
    if (!userText) return;

    setAssistantMessages((prev) => [
      ...prev,
      { role: 'user', content: userText },
    ]);
    setAssistantInput('');
    setAssistantLoading(true);
    try {
      const activeGoals = goals.filter((goal) => goal.status === 'active');
      const goalContextLines = activeGoals.slice(0, 12).map((goal, index) => (
        `${index + 1}. ${goal.title} (${getGoalPercent(goal.id)}% complete)`
      ));

      const selectedGoalContext = selectedGoal
        ? [
          `Selected goal: ${selectedGoal.title}`,
          `Selected goal percent complete: ${getGoalPercent(selectedGoal.id)}%`,
          `Selected goal description: ${selectedGoal.description || 'none provided'}`,
        ].join('\n')
        : 'Selected goal: none';

      const prompt = [
        `You are the AI Goal Assistant for a productivity dashboard chat.`,
        `Use all goals context by default.`,
        `Active goals: ${activeGoals.length}`,
        `Goals list:`,
        goalContextLines.length > 0 ? goalContextLines.join('\n') : 'No active goals listed.',
        selectedGoalContext,
        `User message: ${userText}`,
        `Response style rules:`,
        `- Default to short replies (max 50 words).`,
        `- If the user clearly asks for deep strategy, analysis, step-by-step plans, or detailed reasoning, you may exceed 50 words.`,
        `- Keep responses practical, direct, and goal-oriented.`,
      ].join('\n');

      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          sessionId: 'goals-dashboard-assistant',
          goalId: selectedGoal?.id || null,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Assistant request failed');
      }

      setAssistantMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data?.message || 'No assistant response.' },
      ]);
    } catch (error) {
      console.error('Goal assistant error:', error);
      setAssistantMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Failed to get assistant response: ${error.message}` },
      ]);
    } finally {
      setAssistantLoading(false);
    }
  };

  useEffect(() => {
    const loadGoals = async () => {
      try {
        const { data, error } = await supabase
          .from('goals')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const loadedGoals = data || [];
        setGoals(loadedGoals);

        const goalIds = loadedGoals.map((goal) => goal.id);
        if (goalIds.length === 0) {
          setTasksByGoal({});
          setStatusStats({
            totalActiveGoals: 0,
            goalsDueToday: 0,
            weeklyProgressPercent: 0,
          });
          return;
        }

        let grouped = await fetchTasksGroupedByGoal(goalIds);
        let tasks = Object.values(grouped).flat();

        // Auto-generate AI tasks for goals that have no tasks yet.
        const goalsMissingTasks = loadedGoals.filter((goal) => (grouped[goal.id] || []).length === 0);
        if (goalsMissingTasks.length > 0) {
          console.log('[GoalsDashboard] Auto-generating tasks for goals:', goalsMissingTasks.map((g) => g.id));
          await Promise.all(
            goalsMissingTasks.map(async (goal) => {
              try {
                const response = await fetch(`${API_URL}/goals/ensure-ai/${goal.id}`, { method: 'POST' });
                if (!response.ok) {
                  const err = await response.json().catch(() => ({}));
                  console.warn('[GoalsDashboard] ensure-ai failed', goal.id, err);
                }
              } catch (error) {
                console.warn('[GoalsDashboard] ensure-ai request error', goal.id, error);
              }
            })
          );

          // Refetch tasks after generation so UI shows latest next steps.
          grouped = await fetchTasksGroupedByGoal(goalIds);
          tasks = Object.values(grouped).flat();
        }

        setTasksByGoal(grouped);

        const activeGoals = loadedGoals.filter((goal) => goal.status === 'active');
        const todayKey = new Date().toISOString().slice(0, 10);

        const goalsDueTodayCount = activeGoals.filter((goal) => {
          const goalTasks = grouped[goal.id] || [];
          return goalTasks.some(
            (task) =>
              !task.completed_at &&
              !task.skipped_at &&
              ((task.presented_at && task.presented_at.slice(0, 10) === todayKey) ||
                (task.created_at && task.created_at.slice(0, 10) === todayKey))
          );
        }).length;

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const weeklyTasks = tasks.filter((task) => new Date(task.created_at) >= sevenDaysAgo);
        const weeklyCompleted = weeklyTasks.filter((task) => Boolean(task.completed_at)).length;
        const weeklyProgressPercent = weeklyTasks.length > 0
          ? Math.round((weeklyCompleted / weeklyTasks.length) * 100)
          : 0;

        setStatusStats({
          totalActiveGoals: activeGoals.length,
          goalsDueToday: goalsDueTodayCount,
          weeklyProgressPercent,
        });
      } catch (error) {
        console.error('Failed to load goals dashboard:', error);
        setGoals([]);
        setTasksByGoal({});
        setStatusStats({
          totalActiveGoals: 0,
          goalsDueToday: 0,
          weeklyProgressPercent: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    loadGoals();
  }, []);

  return (
    <div className="goals-dashboard-page">
      <AppNav currentApp="dashboard" />
      <div className="container goals-dashboard-content">
        <header className="goals-dashboard-header">
          <h1>Goal Dashboard</h1>
          <p>All goals in one place</p>
        </header>

        <section className="goals-status-strip">
          <div className="goals-status-item">
            <span className="label">Total Active Goals</span>
            <strong>{statusStats.totalActiveGoals}</strong>
          </div>
          <div className="goals-status-item">
            <span className="label">Goals Due Today</span>
            <strong>{statusStats.goalsDueToday}</strong>
          </div>
          <div className="goals-status-item">
            <span className="label">Weekly Progress %</span>
            <strong>{statusStats.weeklyProgressPercent}%</strong>
          </div>
          <div className="goals-status-progress">
            <div
              className="goals-status-progress-fill"
              style={{ width: `${statusStats.weeklyProgressPercent}%` }}
            />
          </div>
        </section>

        <section className="goals-main-layout">
          <div className="goals-main-left">
            {loading ? (
              <div className="goals-dashboard-empty">Loading goals...</div>
            ) : goals.length === 0 ? (
              <div className="goals-dashboard-empty">No goals found.</div>
            ) : (
              <div className="goals-dashboard-grid">
                {goals.map((goal) => (
                  <article
                    key={goal.id}
                    className={`goals-dashboard-card status-${goal.status} ${selectedGoal?.id === goal.id ? 'selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedGoal(goal)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedGoal(goal);
                      }
                    }}
                  >
                    <h3>{goal.title}</h3>
                    <p>Status: {goal.status}</p>
                    <p>
                      Percent Complete:{' '}
                      {`${getGoalPercent(goal.id)}%`}
                    </p>
                    <p className="goals-dashboard-ai-placeholder">{getGoalNextStep(goal.id)}</p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <aside className="goals-main-right">
            <section className="goal-assistant-panel">
              <div className="goal-assistant-inner">
                <h3>AI Goal Assistant</h3>
                <p className="goal-assistant-selected">
                  Context: {selectedGoal ? `Focused on "${selectedGoal.title}"` : 'All goals'}
                </p>
                <input
                  type="text"
                  className="goal-assistant-input"
                  placeholder="Type a message to the AI assistant..."
                  value={assistantInput}
                  onChange={(e) => setAssistantInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendAssistantMessage();
                    }
                  }}
                />
                <div className="goal-assistant-actions">
                  <button
                    type="button"
                    onClick={sendAssistantMessage}
                    disabled={assistantLoading}
                  >
                    {assistantLoading ? 'Sending...' : 'Send'}
                  </button>
                </div>
                <div className="goal-assistant-output">
                  {assistantMessages.length === 0 ? (
                    <p className="assistant-placeholder">Start chatting with your goal assistant.</p>
                  ) : (
                    assistantMessages.map((msg, idx) => (
                      <div key={`${msg.role}-${idx}`} className={`assistant-message ${msg.role}`}>
                        <span className="assistant-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
                        <p>{msg.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}

export default GoalsDashboard;
