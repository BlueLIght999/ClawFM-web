import { useState, useCallback } from 'react';

const MOOD_LABELS = {
  morning: 'MORNING',
  afternoon: 'AFTERNOON',
  evening: 'EVENING',
  night: 'NIGHT',
};

export default function DJSchedule({ plan, onRefresh, activeBlockIndex, socket }) {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState(null); // user-selected block index
  const [pinned, setPinned] = useState(null);

  const handleSelect = useCallback((i) => {
    if (pinned !== null) return;
    const next = selected === i ? null : i;
    setSelected(next);
    if (socket) {
      socket.emit('plan:select-block', { blockIndex: next });
    }
  }, [selected, pinned, socket]);

  const handlePin = useCallback((e, i) => {
    e.stopPropagation();
    const next = pinned === i ? null : i;
    setPinned(next);
    setSelected(null);
    if (socket) {
      socket.emit('plan:pin-block', { blockIndex: next });
    }
  }, [pinned, socket]);

  const handleAuto = useCallback(() => {
    setSelected(null);
    setPinned(null);
    if (socket) socket.emit('plan:clear-selection');
  }, [socket]);

  if (!plan) {
    return (
      <div className="pixel-border" style={{
        background: 'var(--bg-secondary)', margin: '0 0 8px 0', padding: '10px 16px',
        fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--text-dim)',
        textAlign: 'center',
      }}>
        <span className="cursor-blink">{'Generating schedule...'}</span>
      </div>
    );
  }

  if (!plan.blocks || plan.blocks.length === 0) {
    return (
      <div className="pixel-border" style={{
        background: 'var(--bg-secondary)', margin: '0 0 8px 0', padding: '10px 16px',
        fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-dim)',
        textAlign: 'center',
      }}>
        {'No schedule available.'}
      </div>
    );
  }

  const weatherShort = plan.weather ? plan.weather.split(', ').slice(0, 2).join(', ') : '';
  const isAuto = selected === null && pinned === null;

  return (
    <div className="pixel-border" style={{
      background: 'var(--bg-secondary)', margin: '0 0 8px 0',
    }}>
      {/* Header — clickable toggle */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-pixel)', fontSize: 10, letterSpacing: '1px',
          color: 'var(--text-primary)', background: 'transparent',
          borderBottom: expanded ? '1px solid var(--border-dim)' : 'none',
        }}
      >
        <span style={{ color: 'var(--neon-cyan)', width: 20, textAlign: 'center' }}>
          {expanded ? '[-]' : '[+]'}
        </span>
        <span style={{ color: 'var(--neon-cyan)' }}>{'SCHEDULE'}</span>
        <span style={{ color: 'var(--text-dim)' }}>·</span>
        <span style={{ color: 'var(--accent-glow)' }}>
          {MOOD_LABELS[plan.mood] || plan.mood?.toUpperCase() || 'ON AIR'}
        </span>
        {weatherShort && (
          <>
            <span style={{ color: 'var(--text-dim)' }}>·</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{weatherShort}</span>
          </>
        )}
        <span style={{ flex: 1 }} />
        {/* AUTO button */}
        <button
          className="pixel-btn"
          onClick={(e) => { e.stopPropagation(); handleAuto(); }}
          style={{
            fontSize: 9, padding: '3px 8px', fontFamily: 'var(--font-pixel)',
            background: isAuto ? 'var(--accent)' : 'transparent',
            color: isAuto ? 'var(--bg-primary)' : 'var(--text-dim)',
          }}
        >{'AUTO'}</button>
        {onRefresh && (
          <button
            className="pixel-btn"
            onClick={(e) => { e.stopPropagation(); onRefresh(); }}
            style={{ fontSize: 9, padding: '3px 8px', fontFamily: 'var(--font-pixel)' }}
          >{'REFRESH'}</button>
        )}
      </button>

      {/* Collapsed body */}
      {expanded && (
        <div style={{ padding: '10px 16px 12px' }}>
          {/* Rationale */}
          {plan.rationale && (
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--text-dim)',
              margin: '0 0 12px 0', fontStyle: 'italic',
            }}>
              {plan.rationale}
            </p>
          )}

          {/* Block timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {plan.blocks.map((block, i) => {
              const isActive = activeBlockIndex === i;
              const isSelected = selected === i;
              const isPinned = pinned === i;

              // Visual state: active > pinned > selected > default
              let borderColor = 'var(--accent)';
              let dotColor = 'var(--accent)';
              let dotShadow = '0 0 4px var(--accent-glow)';
              let bg = 'transparent';

              if (isActive) {
                borderColor = 'var(--neon-cyan)';
                dotColor = 'var(--neon-cyan)';
                dotShadow = '0 0 8px var(--neon-cyan), 0 0 16px var(--neon-cyan)';
              } else if (isPinned) {
                borderColor = 'var(--neon-pink)';
                dotColor = 'var(--neon-pink)';
                dotShadow = '0 0 6px var(--neon-pink)';
              } else if (isSelected) {
                borderColor = 'var(--accent-glow)';
                dotColor = 'var(--accent-glow)';
                dotShadow = '0 0 6px var(--accent-glow)';
                bg = 'rgba(224,123,86,0.06)';
              }

              return (
                <div
                  key={i}
                  onClick={() => handleSelect(i)}
                  onDoubleClick={(e) => handlePin(e, i)}
                  style={{
                    borderLeft: `2px solid ${borderColor}`,
                    paddingLeft: 12,
                    position: 'relative',
                    cursor: 'pointer',
                    background: bg,
                    transition: 'border-color 0.3s, background 0.3s',
                  }}
                >
                  {/* Accent dot */}
                  <div style={{
                    position: 'absolute', left: -5, top: 4,
                    width: 8, height: 8,
                    background: dotColor,
                    boxShadow: dotShadow,
                    transition: 'box-shadow 0.3s',
                    ...(isActive ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
                  }} />

                  {/* Header row: theme + count + pin btn */}
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4,
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-pixel)', fontSize: 10, color: dotColor,
                      letterSpacing: '1px',
                    }}>
                      {block.theme}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-pixel)', fontSize: 9, color: 'var(--accent-dark)',
                      background: 'rgba(224,123,86,0.1)', padding: '1px 6px',
                    }}>
                      {block.targetCount || 6}{' TRACKS'}
                    </span>
                    {isPinned && (
                      <span style={{
                        fontFamily: 'var(--font-pixel)', fontSize: 8, color: 'var(--neon-pink)',
                        background: 'rgba(255,107,157,0.15)', padding: '1px 4px',
                      }}>{'PINNED'}</span>
                    )}
                    {(isActive && !isPinned) && (
                      <span style={{
                        fontFamily: 'var(--font-pixel)', fontSize: 8, color: 'var(--neon-cyan)',
                        background: 'rgba(123,255,255,0.1)', padding: '1px 4px',
                      }}>{'NOW'}</span>
                    )}
                    <span style={{ flex: 1 }} />
                    <button
                      className="pixel-btn"
                      onClick={(e) => handlePin(e, i)}
                      style={{
                        fontSize: 8, padding: '1px 6px', fontFamily: 'var(--font-pixel)',
                        opacity: isPinned ? 1 : 0.4,
                      }}
                    >{isPinned ? 'UNPIN' : 'PIN'}</button>
                  </div>

                  {/* Genre hints */}
                  {(block.genreHints && block.genreHints.length > 0) && (
                    <p style={{
                      fontFamily: 'var(--font-mono)', fontSize: 17, color: 'var(--text-dim)',
                      margin: '0 0 2px 0',
                    }}>
                      {block.genreHints.join(', ')}
                    </p>
                  )}

                  {/* Block rationale */}
                  {block.rationale && (
                    <p style={{
                      fontFamily: 'var(--font-mono)', fontSize: 17, color: 'var(--text-secondary)',
                      margin: 0, fontStyle: 'italic',
                    }}>
                      {block.rationale}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer: generated time */}
          {plan.generatedAt && (
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-dim)',
              margin: '12px 0 0 0', textAlign: 'right',
            }}>
              {'Generated '}{new Date(plan.generatedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
