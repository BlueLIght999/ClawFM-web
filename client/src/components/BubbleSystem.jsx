import { useState, useCallback, useEffect } from 'react';
import './bubble.css';

const BUBBLE_COLORS = {
  genre: '#F28C63',
  mood: '#4488FF',
  weather: '#2DD4BF',
};

const BUBBLE_COLORS_DARK = {
  genre: '#D97042',
  mood: '#2266DD',
  weather: '#14B8A6',
};

// Bubble fan-out positions relative to crab mouth (x=100, y=95 in SVG viewBox)
const BUBBLE_SLOTS = [
  { x: -55, y: -70, delay: 0 },
  { x: -20, y: -90, delay: 200 },
  { x: 20, y: -90, delay: 400 },
  { x: 55, y: -70, delay: 600 },
  { x: 0, y: -110, delay: 800 },
];

export default function BubbleSystem({ bubbles, onBubbleClick, visible }) {
  const [poppedIds, setPoppedIds] = useState(new Set());

  // Reset popped state when a new batch arrives
  useEffect(() => {
    setPoppedIds(new Set());
  }, [bubbles]);

  const handleClick = useCallback((bubble) => {
    setPoppedIds(prev => new Set(prev).add(bubble.id));
    onBubbleClick?.(bubble);
  }, [onBubbleClick]);

  if (!visible || !bubbles || bubbles.length === 0) return null;

  return (
    <div className="bubble-container" style={{
      position: 'absolute',
      top: 0, left: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      {bubbles.slice(0, 5).map((bubble, index) => {
        const slot = BUBBLE_SLOTS[index] || BUBBLE_SLOTS[0];
        const isPopped = poppedIds.has(bubble.id);
        const color = BUBBLE_COLORS[bubble.type] || BUBBLE_COLORS.genre;
        const colorDark = BUBBLE_COLORS_DARK[bubble.type] || BUBBLE_COLORS_DARK.genre;

        return (
          <div
            key={bubble.id}
            className={`pixel-bubble ${isPopped ? 'bubble-pop' : 'bubble-blow'}`}
            onClick={(e) => { e.stopPropagation(); handleClick(bubble); }}
            style={{
              position: 'absolute',
              left: `calc(50% + ${slot.x}px)`,
              top: `${slot.y}px`,
              transform: 'translateX(-50%)',
              background: color,
              boxShadow: `0 0 0 2px ${colorDark}, inset 2px 2px 0 rgba(255,255,255,0.3), inset -2px -2px 0 rgba(0,0,0,0.15)`,
              animationDelay: isPopped ? '0s' : `${slot.delay}ms`,
              pointerEvents: 'auto',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <span className="bubble-text">{bubble.label}</span>
          </div>
        );
      })}
    </div>
  );
}
