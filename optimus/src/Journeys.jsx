import { useEffect, useMemo, useState } from 'react';
import AppNav from './components/AppNav';
import { supabase } from './supabaseClient';
import JourneyCanvas from './JourneyCanvas';
import './Journeys.css';

const DEMO_USER_ID = 'demo-user';

const JOURNEY_LIBRARY = [
  {
    id: 'guitar-hero-path',
    title: 'Guitar Hero Path',
    description: 'Build rhythm, speed, and consistency with daily guitar milestones.',
    habits: [
      'Warm-up scales',
      'Chord transition drills',
      'Strumming pattern reps',
      'Ear training session',
      'Metronome speed ladder',
      'Learn one riff',
      'Record a practice clip',
      'Finger stretching',
      'Song playthrough',
    ],
    palette: ['#8c5ce6', '#4aa9f9', '#ff6f91'],
  },
  {
    id: 'morning-master',
    title: 'Morning Master',
    description: 'Craft a vibrant sunrise routine that powers your focus and calm.',
    habits: [
      'Wake at planned time',
      'Hydrate',
      'Sunlight exposure',
      '5-minute stretch',
      '10-minute journaling',
      'Priority planning',
      'Mindful breathing',
      'Protein-rich breakfast',
    ],
    palette: ['#ff9a8b', '#ffd166', '#78c6a3'],
  },
  {
    id: 'fitness-flow',
    title: 'Fitness Flow',
    description: 'Stack movement habits into a smooth, sustainable training rhythm.',
    habits: [
      'Mobility warm-up',
      'Strength session',
      'Core finisher',
      'Post-workout walk',
      'Hydration goal',
      'Protein intake check',
      'Recovery stretch',
      'Sleep routine',
      'Progress logging',
      'Breath reset',
    ],
    palette: ['#06d6a0', '#118ab2', '#9b5de5'],
  },
];

function Journeys() {
  const [journeyRows, setJourneyRows] = useState([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState(JOURNEY_LIBRARY[0].id);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchJourneyProgress = async () => {
      const { data, error } = await supabase
        .from('journey_progress')
        .select('journey_id, user_id, completed_habits, completed_count')
        .eq('user_id', DEMO_USER_ID);

      if (!isMounted) return;

      if (error) {
        console.warn('journey_progress table unavailable, falling back to local templates.', error.message);
        setJourneyRows([]);
        setLoading(false);
        return;
      }

      setJourneyRows(data || []);
      setLoading(false);
    };

    Promise.resolve().then(fetchJourneyProgress);

    return () => {
      isMounted = false;
    };
  }, []);

  const journeys = useMemo(() => {
    return JOURNEY_LIBRARY.map((journey) => {
      const progressRow = journeyRows.find((row) => row.journey_id === journey.id);
      const completedArray = Array.isArray(progressRow?.completed_habits) ? progressRow.completed_habits : [];
      const completedCount = typeof progressRow?.completed_count === 'number'
        ? progressRow.completed_count
        : completedArray.length;
      const totalHabits = journey.habits.length;
      const clampedCompleted = Math.min(completedCount, totalHabits);
      const progress = totalHabits === 0 ? 0 : (clampedCompleted / totalHabits) * 100;

      return {
        ...journey,
        completedCount: clampedCompleted,
        progress,
        isComplete: clampedCompleted === totalHabits,
      };
    });
  }, [journeyRows]);

  const selectedJourney = journeys.find((journey) => journey.id === selectedJourneyId) || journeys[0];

  return (
    <div className="journeys-page">
      <AppNav currentApp="journeys" />

      <header className="journeys-header">
        <h1>Journeys</h1>
        <p>Create or follow pre-made watercolor paths and reveal a full painting by completing linked habits.</p>
      </header>

      <section className="journeys-grid" aria-label="Active journeys">
        {journeys.map((journey) => (
          <button
            type="button"
            key={journey.id}
            className={`journey-card ${selectedJourney?.id === journey.id ? 'selected' : ''}`}
            onClick={() => setSelectedJourneyId(journey.id)}
          >
            <div
              className="journey-thumbnail"
              style={{
                background: `linear-gradient(120deg, ${journey.palette[0]}33, ${journey.palette[1]}88, ${journey.palette[2]}55)`,
              }}
            >
              <div className="journey-thumbnail-fill" style={{ width: `${journey.progress}%` }} />
            </div>
            <h3>{journey.title}</h3>
            <p>{journey.description}</p>
            <span>{journey.completedCount}/{journey.habits.length} habits complete</span>
          </button>
        ))}
      </section>

      {selectedJourney && (
        <section className="journey-fullscreen" aria-label="Journey details">
          <JourneyCanvas
            title={selectedJourney.title}
            progress={selectedJourney.progress}
            completedCount={selectedJourney.completedCount}
            totalHabits={selectedJourney.habits.length}
            isComplete={selectedJourney.isComplete}
          />

          <div className="journey-habits-panel">
            <h3>Linked Habits</h3>
            <ul>
              {selectedJourney.habits.map((habit, index) => {
                const done = index < selectedJourney.completedCount;
                return (
                  <li key={`${selectedJourney.id}-${habit}`} className={done ? 'done' : ''}>
                    <span>{done ? '💦' : '◌'}</span>
                    {habit}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {loading && <p className="journeys-loading">Loading journey progress...</p>}
    </div>
  );
}

export default Journeys;
