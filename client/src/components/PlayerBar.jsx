import { useRef, useEffect, useCallback, useState } from 'react';
import { Pause, Play, Radio, Repeat2, Shuffle, SkipBack, SkipForward } from 'lucide-react';

export default function PlayerBar({
  song, isPlaying, elapsed, duration, mode,
  musicAudioRef, upcomingSongs, onSkip, onPrevious, onPause, onResume, onSetMode, socket,
  showInlineQueue = true,
}) {
  const barRef = useRef(null);
  const seekingRef = useRef(false);
  const seekTimerRef = useRef(null);
  const prevSongIdsRef = useRef(new Set());
  const waveTimerRef = useRef(null);
  const [seekElapsed, setSeekElapsed] = useState(null);
  const [showQueue, setShowQueue] = useState(false);
  const [waveActive, setWaveActive] = useState(false);

  // Use local seek position for 2s after seeking, then revert to server sync
  const displayElapsed = seekElapsed !== null ? seekElapsed : elapsed;
  const progress = duration > 0 ? (displayElapsed / duration) * 100 : 0;

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const doSeek = useCallback((clientX) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetTime = pct * duration;
    const audio = musicAudioRef?.current;
    if (audio && duration > 0) {
      audio.currentTime = targetTime;
    }
    // Immediately show local position
    setSeekElapsed(targetTime);
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
    seekTimerRef.current = setTimeout(() => setSeekElapsed(null), 2000);
    if (socket) socket.emit('player:seek', { position: targetTime });
  }, [musicAudioRef, duration, socket]);

  const handleMouseDown = useCallback((e) => {
    seekingRef.current = true;
    doSeek(e.clientX);
  }, [doSeek]);

  useEffect(() => {
    const onMove = (e) => {
      if (seekingRef.current) doSeek(e.clientX);
    };
    const onUp = () => { seekingRef.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [doSeek]);

  // Cleanup wave timer on unmount
  useEffect(() => {
    return () => { if (waveTimerRef.current) clearTimeout(waveTimerRef.current); };
  }, []);

  return (
    <div className="pixel-border" style={{
      padding: '2px 8px',
      background: 'var(--bg-secondary)',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
    }}>
      {/* Progress bar */}
      <div ref={barRef} onMouseDown={handleMouseDown} style={{
        width: '100%', height: 4, background: 'var(--bg-primary)',
        border: '1px solid var(--border-dim)', cursor: 'pointer',
        position: 'relative', userSelect: 'none',
      }}>
        <div style={{
          height: '100%', width: `${Math.min(progress, 100)}%`,
          background: 'var(--accent)', boxShadow: '0 0 3px rgba(224,123,86,0.5)',
          pointerEvents: 'none',
        }} />
        <span className="pixel-text" style={{
          position: 'absolute', top: 6, left: 0, fontSize: 9, color: 'var(--text-dim)', pointerEvents: 'none',
        }}>{formatTime(displayElapsed)}</span>
        <span className="pixel-text" style={{
          position: 'absolute', top: 6, right: 0, fontSize: 9, color: 'var(--text-dim)', pointerEvents: 'none',
        }}>{formatTime(duration)}</span>
      </div>

      {/* Song info + controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {song ? (
            <>
              <div className="marquee" style={{ maxWidth: 260 }}>
                <div className="marquee-inner" style={{
                  fontFamily: 'var(--font-pixel)', fontSize: 9, color: 'var(--text-primary)',
                }}>
                  {song.title || 'Unknown Track'}
                </div>
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-secondary)', marginTop: 1,
              }}>
                {song.artist || '---'}
              </div>
            </>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-dim)' }}>
              {'Waiting for signal...'}
            </span>
          )}
        </div>

        {isPlaying && (
          <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: 12 }}>
            {[2, 5, 3, 7, 4, 2, 5, 3].map((h, i) => (
              <div key={i} style={{
                width: 2, height: h,
                background: 'var(--accent)',
                animation: `eq-bar ${0.3 + i * 0.12}s ease-in-out infinite alternate`,
              }} />
            ))}
          </div>
        )}

        <div className="player-transport-controls">
          <button className="pixel-btn radio-control-button"
            onClick={() => onSetMode(mode === 'sequential' ? 'shuffle' : mode === 'shuffle' ? 'fm' : 'sequential')}
            aria-label={`Change queue mode. Current mode: ${mode}`}
            title={`Mode: ${mode}`}
            ><QueueModeIcon mode={mode} /></button>
          <button className="pixel-btn radio-control-button" onClick={onPrevious}
            aria-label="Previous track" title="Previous track"><SkipBack size={15} aria-hidden="true" /></button>
          <button className="pixel-btn accent radio-control-button" onClick={isPlaying ? onPause : onResume}
            aria-label={isPlaying ? 'Pause' : 'Resume'} title={isPlaying ? 'Pause' : 'Resume'}>
            {isPlaying ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
          </button>
          <button className="pixel-btn radio-control-button" onClick={onSkip}
            aria-label="Next track" title="Next track"><SkipForward size={15} aria-hidden="true" /></button>
        </div>
      </div>

      {/* Upcoming queue */}
      {showInlineQueue && upcomingSongs && upcomingSongs.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 3 }}>
          <button className="pixel-btn" onClick={() => setShowQueue(!showQueue)}
            style={{ fontSize: 9, padding: '2px 6px', display: 'block', margin: '0 auto 3px' }}>
            {showQueue ? '▲ HIDE' : '▼ NEXT (' + upcomingSongs.length + ')'}
          </button>
          {showQueue && (
            <div style={{
              maxHeight: 340, overflowY: 'auto', fontFamily: 'var(--font-mono)',
              fontSize: 15, color: 'var(--text-dim)', padding: '0 4px',
            }}>
              {(() => {
                const currentIds = new Set(upcomingSongs.map(s => s.id));
                const newIds = new Set(
                  [...currentIds].filter(id => !prevSongIdsRef.current.has(id))
                );
                prevSongIdsRef.current = currentIds;

                // Trigger wave after all slide-in animations complete
                if (newIds.size > 0) {
                  const maxStagger = Math.min((upcomingSongs.length - 1) * 60, 300);
                  const slideCompleteDelay = 400 + maxStagger;
                  if (waveTimerRef.current) clearTimeout(waveTimerRef.current);
                  waveTimerRef.current = setTimeout(() => {
                    setWaveActive(true);
                    setTimeout(() => setWaveActive(false), 600);
                  }, slideCompleteDelay);
                }

                return upcomingSongs.map((s, i) => {
                  const isNew = newIds.has(s.id);
                  const slideDelay = isNew ? Math.min(i * 60, 300) : 0;
                  const waveDelay = i * 40;
                  const animations = [];
                  if (isNew) {
                    animations.push(`queueSlideIn 0.4s ease-out ${slideDelay}ms both`);
                  }
                  if (waveActive) {
                    animations.push(`queueWave 0.5s ease-in-out ${waveDelay}ms`);
                  }
                  return (
                    <div key={s.id || i}
                      onClick={() => { if (socket) socket.emit('player:skip-to-index', { index: i }); }}
                      title={'Click to skip to this song'}
                      style={{
                        display: 'flex', justifyContent: 'space-between', padding: '2px 4px',
                        borderBottom: '1px dotted var(--border-dim)',
                        cursor: 'pointer', borderRadius: 2,
                        transition: 'background 0.1s',
                        animation: animations.length > 0 ? animations.join(', ') : 'none',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-primary)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {i + 1}. {s.title || '???'}
                      </span>
                      <span style={{ marginLeft: 8, flexShrink: 0 }}>
                        {s.artist || ''}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes eq-bar { 0% { height: 2px; } 100% { height: 10px; } }
      `}</style>
    </div>
  );
}

function QueueModeIcon({ mode }) {
  if (mode === 'shuffle') return <Shuffle size={14} aria-hidden="true" />;
  if (mode === 'fm') return <Radio size={14} aria-hidden="true" />;
  return <Repeat2 size={14} aria-hidden="true" />;
}
