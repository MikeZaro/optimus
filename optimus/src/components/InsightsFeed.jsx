import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import InsightCard from './InsightCard';
import './InsightsFeed.css';

const sampleInsights = [
  {
    id: 'sleep-guitar-synergy',
    title: 'Sleep + Music Synergy',
    summary: 'Your sleep improved 22% since adding guitar time – nice synergy!',
    detail:
      'In this stubbed weekly snapshot, your evening guitar sessions line up with longer sleep windows and better mood check-ins the next morning.',
    blob: 'radial-gradient(circle at 18% 25%, rgba(255,190,157,.9), rgba(255,140,170,.58) 58%, rgba(186,170,255,.45) 100%)',
  },
  {
    id: 'meditation-streak',
    title: 'Meditation Momentum',
    summary: 'You hit 5-day streak on meditation – keep the flow going!',
    detail:
      'Streak consistency tends to increase your next-day completion rate. Continuing this rhythm is likely to keep your week smooth and focused.',
    blob: 'radial-gradient(circle at 16% 24%, rgba(167,233,255,.92), rgba(150,200,255,.62) 56%, rgba(172,184,255,.42) 100%)',
  },
  {
    id: 'energy-completions',
    title: 'Energy Predicts Follow-Through',
    summary: 'High-energy days = 3× more likely to finish habits',
    detail:
      'Placeholder trend line suggests your self-reported high-energy days correlate with substantially stronger completion rates across all core habits.',
    blob: 'radial-gradient(circle at 24% 26%, rgba(184,255,205,.9), rgba(167,238,191,.62) 52%, rgba(150,216,255,.4) 100%)',
  },
  {
    id: 'mood-anchoring',
    title: 'Mood Anchoring Pattern',
    summary: 'Morning walks appear to stabilize your mood by late afternoon.',
    detail:
      'This is a weekly placeholder insight generated from mood + habit behavior. A future model can score confidence and show historical comparatives.',
    blob: 'radial-gradient(circle at 17% 20%, rgba(255,246,174,.9), rgba(255,210,176,.65) 54%, rgba(255,178,176,.38) 100%)',
  },
];

function InsightsFeed() {
  const [selectedInsight, setSelectedInsight] = useState(null);

  const insights = useMemo(() => {
    // Stub: this is where weekly generation from mood + habit data will run.
    return sampleInsights;
  }, []);

  return (
    <section className="insights-feed" aria-label="Weekly insights">
      <div className="insights-feed-header">
        <div>
          <p className="insights-overline">Today</p>
          <h2>Watercolor Insights</h2>
        </div>
        <p className="insights-subtext">Generated weekly from mood + habit data (stub)</p>
      </div>

      <div className="insights-carousel" role="list">
        {insights.map((insight, index) => (
          <div className="insights-slide" role="listitem" key={insight.id}>
            <InsightCard insight={insight} index={index} onOpen={setSelectedInsight} />
          </div>
        ))}
      </div>

      <AnimatePresence>
        {selectedInsight && (
          <motion.div
            className="insight-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedInsight(null)}
          >
            <motion.div
              className="insight-modal"
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 26, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              onClick={(event) => event.stopPropagation()}
            >
              <button className="insight-modal-close" onClick={() => setSelectedInsight(null)} type="button">
                ×
              </button>
              <p className="insight-modal-kicker">Weekly Insight</p>
              <h3>{selectedInsight.title}</h3>
              <p>{selectedInsight.detail}</p>
              <div className="insight-chart-placeholder" aria-label="Insight chart placeholder">
                <span style={{ height: '35%' }} />
                <span style={{ height: '52%' }} />
                <span style={{ height: '68%' }} />
                <span style={{ height: '44%' }} />
                <span style={{ height: '79%' }} />
                <span style={{ height: '63%' }} />
              </div>
              <p className="insight-modal-note">Chart details coming next: mood + habit time-series and confidence score.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export default InsightsFeed;
