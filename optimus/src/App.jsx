import { useState, useEffect } from 'react'
import './App.css'
import { supabase } from './supabaseClient'
import InsightsFeed from './components/InsightsFeed'

const todayPrinciple = 'Execute the bottleneck, then keep moving.'

function App() {
  const [scoreboard, setScoreboard] = useState([])
  const [tasksByDomain, setTasksByDomain] = useState({})
  const [progressPoints, setProgressPoints] = useState([])
  const [completed, setCompleted] = useState([])
  const [loading, setLoading] = useState(true)
  const [weeklyStats, setWeeklyStats] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const today = new Date()
  const formattedDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  // Load data from Supabase on page load
  useEffect(() => {
    loadData()
    loadWeeklyStats()
  }, [])

  const loadData = async () => {
    try {
      // Fetch tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
      
      if (tasksError) throw tasksError
      
      // Fetch streaks
      const { data: streaksData, error: streaksError } = await supabase
        .from('streaks')
        .select('*')
      
      if (streaksError) throw streaksError
      
      // Fetch progress
      const { data: progressData, error: progressError } = await supabase
        .from('daily_progress')
        .select('progress_points')
        .order('date', { ascending: true })
        .limit(30)

      if (progressError) throw progressError

      // Organize tasks by domain
      const organized = {}
      tasksData.forEach((task) => {
        if (!organized[task.domain]) organized[task.domain] = []
        organized[task.domain].push({
          id: task.id,
          text: task.text,
          bottleneck: task.is_bottleneck,
        })
      })
      setTasksByDomain(organized)

      // Set scoreboard from streaks
      setScoreboard(streaksData || [])

      // Set progress points
      const points = progressData?.map((p) => p.progress_points) || []
      setProgressPoints(points)

      setLoading(false)
    } catch (error) {
      console.error('Error loading data:', error)
      alert('Error loading data from Supabase. Check console for details.')
      setLoading(false)
    }
  }

  const loadWeeklyStats = async () => {
    try {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .order('date', { ascending: false })
        .limit(7)

      if (error) {
        console.error('Error loading weekly stats:', error)
        return
      }

      if (data && data.length > 0) {
        const totalCompleted = data.reduce((sum, day) => sum + day.tasks_completed, 0)
        const totalTasks = data.reduce((sum, day) => sum + day.total_tasks, 0)
        const avgCompletionRate = totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0
        
        setWeeklyStats({
          daysLogged: data.length,
          totalCompleted,
          avgCompletionRate: Math.round(avgCompletionRate),
          recentLogs: data
        })
      }
    } catch (error) {
      console.error('Error loading weekly stats:', error)
    }
  }

  const handleTaskToggle = (id) => {
    setCompleted((prev) =>
      prev.includes(id) ? prev.filter((taskId) => taskId !== id) : [...prev, id]
    )
  }

  const logToday = async () => {
    if (completed.length === 0) {
      alert('No tasks completed today')
      return
    }

    try {
      console.log('Attempting to log tasks:', completed)
      
      const todayDate = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
      
      // Step 1: Log individual task completions
      const completionPromises = completed.map(taskId => 
        supabase.from('task_completions').insert({
          task_id: taskId,
          completed_at: new Date().toISOString(),
        })
      )
      
      const completionResults = await Promise.all(completionPromises)
      
      // Check for errors in task completions
      const completionErrors = completionResults.filter(result => result.error)
      if (completionErrors.length > 0) {
        console.error('Some task completions failed:', completionErrors)
      }

      // Step 2: Calculate metrics
      const totalTasks = Object.values(tasksByDomain).flat().length
      const bottlenecksCompleted = completed.filter(id => {
        return Object.values(tasksByDomain)
          .flat()
          .find(t => t.id === id && t.bottleneck)
      }).length

      // Step 3: Create daily summary log (upsert to handle duplicate dates)
      const { data: dailyLogData, error: dailyLogError } = await supabase
        .from('daily_logs')
        .upsert({
          date: todayDate,
          tasks_completed: completed.length,
          total_tasks: totalTasks,
          completed_task_ids: completed,
          bottlenecks_completed: bottlenecksCompleted,
        }, {
          onConflict: 'date'
        })
        .select()

      if (dailyLogError) {
        console.error('Error creating daily summary:', dailyLogError)
        throw dailyLogError
      }

      console.log('Daily log created:', dailyLogData)

      // Step 4: Update daily progress table
      const progressScore = Math.round((completed.length / totalTasks) * 100)
      
      const { data: progressData, error: progressError } = await supabase
        .from('daily_progress')
        .upsert({
          date: todayDate,
          progress_points: progressScore,
        }, {
          onConflict: 'date'
        })
        .select()

      if (progressError) {
        console.error('Error updating daily progress:', progressError)
        throw progressError
      }

      console.log('Progress updated:', progressData)

      // Step 5: Update streaks (if applicable)
      await updateStreaks(completed)

      alert(`Progress logged successfully!\n${completed.length} tasks completed\nProgress score: ${progressScore}`)
      setCompleted([])
      
      // Reload data to reflect changes
      await loadData()
      await loadWeeklyStats()
      
    } catch (error) {
      console.error('Error logging today:', error)
      alert('Error saving progress. Check console for details.')
    }
  }

  const updateStreaks = async (completedTaskIds) => {
    try {
      // Get the domains of completed tasks
      const completedDomains = new Set()
      
      Object.entries(tasksByDomain).forEach(([domain, tasks]) => {
        const domainHasCompletedTask = tasks.some(task => 
          completedTaskIds.includes(task.id)
        )
        if (domainHasCompletedTask) {
          completedDomains.add(domain)
        }
      })

      // Update streak for each domain with completed tasks
      for (const domain of completedDomains) {
        const { data: currentStreak } = await supabase
          .from('streaks')
          .select('*')
          .eq('domain', domain)
          .single()

        if (currentStreak) {
          const newStreak = currentStreak.current_streak + 1
          
          await supabase
            .from('streaks')
            .update({ 
              current_streak: newStreak,
              last_updated: new Date().toISOString()
            })
            .eq('domain', domain)
        }
      }
    } catch (error) {
      console.error('Error updating streaks:', error)
    }
  }

  const isAligned = (status) => {
    if (status === 'aligned') return 'status-aligned'
    if (status === 'neutral') return 'status-neutral'
    return 'status-lagging'
  }

  const renderDomainTasks = (domain) => {
    const tasks = tasksByDomain[domain] || []
    return (
      <section key={domain} className="task-domain">
        <div className="task-header">
          <div>
            <h3>{domain}</h3>
            {domain === 'Work' && <p className="muted">Conversion is limiting progress</p>}
          </div>
          <span className="task-count">
            {tasks.filter((task) => completed.includes(task.id)).length} / {tasks.length}
          </span>
        </div>
        <ul>
          {tasks.slice(0, 3).map((task) => (
            <li key={task.id}>
              <button
                className={`task-button ${task.bottleneck ? 'bottleneck' : ''} ${
                  completed.includes(task.id) ? 'complete' : ''
                }`}
                onClick={() => handleTaskToggle(task.id)}
              >
                {task.text}
              </button>
              {task.bottleneck && <span className="bottleneck-tag">Bottleneck action</span>}
            </li>
          ))}
        </ul>
      </section>
    )
  }

  const renderWeeklyStats = () => {
    if (!weeklyStats) return null

    return (
      <section className="weekly-stats">
        <div className="stats-header">
          <p className="label">Weekly Overview</p>
          <button 
            className="view-history-btn"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? 'Hide History' : 'View History'}
          </button>
        </div>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-value">{weeklyStats.daysLogged}</span>
            <span className="stat-label">Days Logged</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{weeklyStats.totalCompleted}</span>
            <span className="stat-label">Tasks Completed</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{weeklyStats.avgCompletionRate}%</span>
            <span className="stat-label">Avg Completion</span>
          </div>
        </div>
        
        {showHistory && (
          <div className="history-list">
            <h4>Recent Activity</h4>
            {weeklyStats.recentLogs.map((log) => (
              <div key={log.date} className="history-item">
                <span className="history-date">
                  {new Date(log.date).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </span>
                <span className="history-tasks">
                  {log.tasks_completed}/{log.total_tasks} tasks
                </span>
                <span className="history-score">
                  {Math.round((log.tasks_completed / log.total_tasks) * 100)}%
                </span>
                {log.bottlenecks_completed > 0 && (
                  <span className="history-bottleneck">
                    🎯 {log.bottlenecks_completed} bottleneck{log.bottlenecks_completed > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    )
  }

  if (loading) return <div className="page">Loading...</div>

  return (
    <div className="page">
      <header className="orientation">
        <div className="date">{formattedDate}</div>
        <div className="principle">{todayPrinciple}</div>
      </header>

      <nav className="top-tab">
        <div className="tab-link">
          <a href="https://calendar.google.com" target="_blank" rel="noreferrer">
            Calendar
          </a>
        </div>
      </nav>

      <section className="bottleneck-card">
        <p className="label">Current Bottleneck</p>
        <div className="bottleneck-content">
          <strong>Work</strong>
          <span className="muted">Conversion is limiting progress</span>
        </div>
      </section>

      <section className="scoreboard">
        {scoreboard.map(({ domain, current_streak, status }) => (
          <div key={domain} className={`score-card ${isAligned(status)}`}>
            <p className="label">{domain}</p>
            <div className="score-value">{current_streak} day streak</div>
            <div className="status-dot" />
          </div>
        ))}
      </section>

      {renderWeeklyStats()}

      <section className="tasks">
        {renderDomainTasks('Work')}
        {renderDomainTasks('Personal')}
        {renderDomainTasks('Education')}
      </section>

      <section className="progress">
        <div className="progress-header">
          <div>
            <p className="label">Progress Snapshot</p>
            <strong>Trajectory: Improving</strong>
          </div>
        </div>
        <svg viewBox="0 0 120 40" className="progress-graph">
          <polyline
            points={progressPoints.map((point, index) => `${(index / (progressPoints.length - 1)) * 120},${40 - point / 30 * 40}`).join(' ')}
          />
        </svg>
      </section>

      <InsightsFeed />

      <footer className="home-footer">
        <button className="talk-button" onClick={() => console.log('Talk entry triggered')}>
          Talk
        </button>
        <button className="primary-button" onClick={logToday}>
          Log Today
        </button>
      </footer>
    </div>
  )
}

export default App