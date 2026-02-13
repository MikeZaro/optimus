import './JourneyCanvas.css';

const DEFAULT_ART_PIECES = [
  { id: 'brush-1', glyph: '🎨', label: 'Brush stroke' },
  { id: 'leaf-1', glyph: '🍃', label: 'Leaf bloom' },
  { id: 'note-1', glyph: '🎵', label: 'Creative note' },
  { id: 'star-1', glyph: '⭐', label: 'Sparkle star' },
  { id: 'petal-1', glyph: '🌸', label: 'Petal wash' },
  { id: 'brush-2', glyph: '🖌️', label: 'Soft wash' },
  { id: 'leaf-2', glyph: '🌿', label: 'Garden leaf' },
  { id: 'note-2', glyph: '🎶', label: 'Melody note' },
  { id: 'star-2', glyph: '✨', label: 'Glow star' },
  { id: 'petal-2', glyph: '🌺', label: 'Final petal' },
  { id: 'brush-3', glyph: '🪻', label: 'Lavender stroke' },
  { id: 'spark-1', glyph: '💧', label: 'Water drop' },
];

function JourneyCanvas({
  title,
  progress,
  completedCount,
  totalHabits,
  artPieces = DEFAULT_ART_PIECES,
  isComplete,
}) {
  const unlockedPieces = Math.min(completedCount, artPieces.length);

  return (
    <section className={`journey-canvas ${isComplete ? 'journey-canvas-complete' : ''}`}>
      <header className="journey-canvas-header">
        <h2>{title}</h2>
        <p>
          {completedCount}/{totalHabits} habits completed
        </p>
      </header>

      <div className="journey-canvas-painting" role="img" aria-label={`${title} watercolor progress`}>
        <div className="journey-canvas-base" />
        <div className="journey-canvas-fill" style={{ width: `${progress}%` }} />

        {artPieces.map((piece, index) => (
          <div
            key={piece.id}
            className={`journey-art-piece ${index < unlockedPieces ? 'unlocked' : ''}`}
            style={{
              left: `${8 + (index % 6) * 15}%`,
              top: `${18 + (index % 2) * 34 + Math.floor(index / 6) * 14}%`,
              animationDelay: `${index * 90}ms`,
            }}
            title={piece.label}
          >
            {piece.glyph}
          </div>
        ))}

        {isComplete && (
          <div className="journey-canvas-confetti" aria-hidden="true">
            {Array.from({ length: 20 }).map((_, index) => (
              <span
                key={`splash-${index + 1}`}
                className="splash-dot"
                style={{
                  left: `${6 + ((index * 13) % 90)}%`,
                  top: `${12 + ((index * 17) % 72)}%`,
                  animationDelay: `${index * 80}ms`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="journey-canvas-progress">
        <div className="journey-canvas-progress-track">
          <div className="journey-canvas-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span>{Math.round(progress)}%</span>
      </div>

      {isComplete && <p className="journey-badge">🏅 Watercolor Journey Badge Unlocked</p>}
    </section>
  );
}

export default JourneyCanvas;
