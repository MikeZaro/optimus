import { motion } from 'framer-motion';
import './InsightCard.css';

function WatercolorInsightIcon() {
  return (
    <svg className="insight-icon" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="bulb-wash" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd8a8" stopOpacity="0.92" />
          <stop offset="55%" stopColor="#ffadad" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#bdb2ff" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path d="M32 8c-10.2 0-18 7.4-18 17 0 6.5 3.5 10.7 7.5 14.7 2.3 2.3 3.5 4.1 3.8 6.7h13.4c.3-2.6 1.4-4.4 3.7-6.7 4-4 7.6-8.2 7.6-14.7C50 15.4 42.2 8 32 8Z" fill="url(#bulb-wash)" />
      <path d="M24 50h16" stroke="#7b5ea7" strokeWidth="3" strokeLinecap="round" />
      <path d="M26 55h12" stroke="#7b5ea7" strokeWidth="3" strokeLinecap="round" />
      <circle cx="26" cy="46" r="2" fill="#8c6cc5" />
      <circle cx="38" cy="45" r="2.2" fill="#8c6cc5" />
      <path d="M19 35c1.5 3.5 3.5 5 5 5" stroke="#8c6cc5" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M45 35c-1.5 3.5-3.5 5-5 5" stroke="#8c6cc5" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function InsightCard({ insight, onOpen, index = 0 }) {
  return (
    <motion.article
      className="insight-card"
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.45 }}
      transition={{ duration: 0.55, delay: index * 0.08, ease: 'easeOut' }}
    >
      <button className="insight-card-tap" onClick={() => onOpen(insight)} type="button">
        <span className="insight-watercolor-blob" style={{ background: insight.blob }} />
        <div className="insight-card-head">
          <WatercolorInsightIcon />
          <div>
            <p className="insight-kicker">Insight</p>
            <h3 className="insight-title">{insight.title}</h3>
          </div>
        </div>
        <p className="insight-summary">{insight.summary}</p>
        <span className="insight-cta">Tap for details →</span>
      </button>
    </motion.article>
  );
}

export default InsightCard;
