import { useState, useEffect, useRef } from 'react';

function parseLrc(lrcText) {
  if (!lrcText) return [];
  const lines = lrcText.split('\n');
  const parsed = [];
  for (const line of lines) {
    const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      let ms = parseInt(match[3], 10);
      if (ms < 100) ms *= 10; // normalize .xx → milliseconds
      const time = min * 60 + sec + ms / 1000;
      const text = match[4].trim();
      if (text) parsed.push({ time, text });
    }
  }
  return parsed;
}

export default function LyricsDisplay({ songId, song, elapsed, isPlaying }) {
  const [lyrics, setLyrics] = useState([]);
  const [transLyrics, setTransLyrics] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef(null);

  // Fetch lyrics when song changes
  useEffect(() => {
    if (!songId) { setLyrics([]); setTransLyrics([]); return; }
    fetch(`/api/lyric/${songId}`)
      .then(r => r.json())
      .then(data => {
        setLyrics(parseLrc(data.lrc));
        setTransLyrics(parseLrc(data.tlrc));
        setActiveIdx(-1);
      })
      .catch(() => { setLyrics([]); setTransLyrics([]); });
  }, [songId]);

  // Track current lyric line based on elapsed
  useEffect(() => {
    if (!lyrics.length) return;
    const idx = lyrics.findIndex((l, i) => {
      const next = lyrics[i + 1];
      return elapsed >= l.time && (!next || elapsed < next.time);
    });
    if (idx !== activeIdx && idx >= 0) {
      setActiveIdx(idx);
      // Scroll active line into view
      const el = containerRef.current?.children[idx];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [elapsed, lyrics, activeIdx]);

  if (!song || !lyrics.length) {
    return (
      <div style={{
        padding: '4px 10px', fontFamily: 'var(--font-mono)',
        fontSize: 16, color: 'var(--text-dim)', textAlign: 'center',
      }}>
        {song ? 'No lyrics available' : ''}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{
      maxHeight: 100,
      overflow: 'hidden',
      padding: '4px 10px',
      fontFamily: 'var(--font-mono)',
      fontSize: 17,
      lineHeight: '18px',
      textAlign: 'center',
    }}>
      {lyrics.map((l, i) => {
        const isActive = i === activeIdx;
        const trans = transLyrics.find(t => Math.abs(t.time - l.time) < 0.1);
        return (
          <div key={i} style={{
            color: isActive ? 'var(--accent)' : 'var(--text-dim)',
            fontWeight: isActive ? 'bold' : 'normal',
            textShadow: isActive ? '0 0 8px rgba(224,123,86,0.5)' : 'none',
            transition: 'color 0.3s, text-shadow 0.3s',
            padding: '2px 0',
          }}>
            {l.text}
            {trans && (
              <div style={{ fontSize: 15, color: isActive ? 'var(--text-secondary)' : 'var(--text-dim)', opacity: 0.7 }}>
                {trans.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
