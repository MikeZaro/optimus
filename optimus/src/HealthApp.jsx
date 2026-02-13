import { useState, useEffect } from 'react';
import './HealthApp.css';
import AppNav from './components/AppNav';
import HealthStatusCard from './components/HealthStatusCard';
import HealthMetricsCard from './components/HealthMetricsCard';
import HealthImportModal from './components/HealthImportModal';
import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function HealthApp() {
  const [healthData, setHealthData] = useState({});
  const [trendData, setTrendData] = useState({});
  const [loading, setLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Load today's health data
  const loadTodayHealth = async () => {
    try {
      const response = await fetch(`${API_URL}/health/daily?date=${selectedDate}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data?.error);
      setHealthData(data);
    } catch (error) {
      console.error('Error loading health data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load trend data (last 30 days)
  const loadTrends = async () => {
    try {
      const types = ['steps', 'sleep', 'heart_rate', 'calories'];
      const trends = {};

      await Promise.all(
        types.map(async (type) => {
          const response = await fetch(`${API_URL}/health/stats/${type}?days=30`);
          const data = await response.json();
          if (response.ok) trends[type] = data;
        })
      );

      setTrendData(trends);
    } catch (error) {
      console.error('Error loading trends:', error);
    }
  };

  useEffect(() => {
    loadTodayHealth();
    loadTrends();

    // Real-time subscription (pattern from HabitsApp.jsx)
    const subscription = supabase
      .channel('health-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'health_data' },
        () => {
          loadTodayHealth();
          loadTrends();
        }
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [selectedDate]);

  const handleImportComplete = () => {
    setShowImportModal(false);
    loadTodayHealth();
    loadTrends();
  };

  return (
    <div className="health-app">
      <AppNav currentApp="health" />

      <div className="container">
        <header className="health-header">
          <h1>Health Dashboard</h1>
          <p className="health-date">{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </header>

        {/* Import button */}
        <div className="health-toolbar">
          <button
            className="health-btn primary"
            onClick={() => setShowImportModal(true)}
          >
            + Import Apple Health Data
          </button>
        </div>

        {/* Status card (like HabitStatusCard) */}
        {!loading && (
          <HealthStatusCard data={healthData} />
        )}

        {/* Metrics grid */}
        <div className="health-metrics-grid">
          <HealthMetricsCard
            type="steps"
            title="Steps"
            emoji="🚶"
            value={healthData.steps || 0}
            unit="steps"
            goal={10000}
            trend={trendData.steps?.days || []}
          />
          <HealthMetricsCard
            type="sleep"
            title="Sleep"
            emoji="😴"
            value={healthData.sleep || 0}
            unit="hours"
            goal={8}
            trend={trendData.sleep?.days || []}
          />
          <HealthMetricsCard
            type="calories"
            title="Active Calories"
            emoji="🔥"
            value={healthData.calories || 0}
            unit="kcal"
            goal={500}
            trend={trendData.calories?.days || []}
          />
          <HealthMetricsCard
            type="heart_rate"
            title="Heart Rate"
            emoji="❤️"
            value={healthData.heartRate?.avg || 0}
            unit="bpm"
            goal={70}
            trend={trendData.heart_rate?.days || []}
          />
        </div>

        {/* Workouts section */}
        {healthData.workouts && healthData.workouts.length > 0 && (
          <div className="health-workouts">
            <h2>Today's Workouts</h2>
            <div className="workout-list">
              {healthData.workouts.map((workout, index) => (
                <div key={index} className="workout-card">
                  <span className="workout-icon">💪</span>
                  <div className="workout-details">
                    <h3>{workout.additional_data?.workoutType || 'Workout'}</h3>
                    <p>{workout.additional_data?.duration || workout.value} minutes</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Import modal */}
      {showImportModal && (
        <HealthImportModal
          onClose={() => setShowImportModal(false)}
          onImportComplete={handleImportComplete}
        />
      )}
    </div>
  );
}

export default HealthApp;
