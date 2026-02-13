import './HeightWeightCard.css';

function HeightWeightCard({ type, value, unit, onEdit }) {
  const config = {
    height: { emoji: '📏', label: 'Height', defaultValue: '--' },
    weight: { emoji: '⚖️', label: 'Weight', defaultValue: '--' }
  };

  const { emoji, label, defaultValue } = config[type];

  return (
    <div className="height-weight-card">
      <div className="hw-card-header">
        <span className="hw-emoji">{emoji}</span>
        <h3 className="hw-label">{label}</h3>
      </div>

      <div className="hw-value">
        {value || defaultValue}
        {value && <span className="hw-unit">{unit}</span>}
      </div>

      <button className="hw-edit-btn" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}

export default HeightWeightCard;
