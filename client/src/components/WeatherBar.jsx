import { useState, useEffect, useRef } from 'react';

/* 8×8 pixel weather icons using box-shadow */
const ICONS = {
  '晴': [[2,2],[3,2],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5],[2,6],[3,6],[4,6],[5,6]],
  '少云': [[2,2],[3,2],[4,2],[5,2],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5],[2,6],[3,6],[4,6],[5,6]],
  '多云': [[1,1],[2,1],[3,1],[4,1],[5,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[2,5],[3,5],[4,5],[5,5],[3,6],[4,6]],
  '阴': [[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[2,5],[3,5],[4,5],[5,5]],
  '雾': [[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[2,5],[3,5],[4,5],[5,5]],
  '雨': [[1,1],[2,1],[3,1],[4,1],[5,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[3,5],[4,5],[2,6],[5,6],[1,7],[6,7]],
  '雷暴': [[1,1],[2,1],[3,1],[4,1],[5,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[3,4],[4,5],[3,6],[4,6],[3,5],[4,5]],
  '雪': [[1,1],[2,1],[3,1],[4,1],[5,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[3,5],[4,5],[2,6],[5,6],[1,7],[6,7],[3,6],[4,6]],
};

function PixelIcon({ weatherText }) {
  // Extract the Chinese weather description
  const desc = Object.keys(ICONS).find(k => weatherText.includes(k));
  const pixels = ICONS[desc] || ICONS['晴'];

  if (!pixels) return null;

  const s = '2px';
  const shadow = pixels.map(([x, y]) => `${x * 2}px ${y * 2}px 0 var(--accent)`).join(',');

  return (
    <div style={{ width: 16, height: 16, flexShrink: 0, position: 'relative' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, width: s, height: s,
        boxShadow: shadow,
      }} />
    </div>
  );
}

export default function WeatherBar() {
  const [weather, setWeather] = useState(null);
  const lastWeather = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchWeather() {
      try {
        const res = await fetch('/api/weather');
        const data = await res.json();
        if (!cancelled && data.ok && data.text) {
          lastWeather.current = data.text;
          setWeather(data.text);
        }
      } catch {}
    }
    fetchWeather();
    // Re-fetch after geolocation has time to update server-side coords
    const retry = setTimeout(fetchWeather, 5000);
    const interval = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => { cancelled = true; clearTimeout(retry); clearInterval(interval); };
  }, []);

  // Show last known weather while re-fetching
  const display = weather || lastWeather.current;
  if (!display) return null;

  const parts = display.split(', ');

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '3px 10px',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border-dim)',
      fontFamily: 'var(--font-pixel)',
      fontSize: 7,
      color: 'var(--text-secondary)',
      imageRendering: 'pixelated',
      justifyContent: 'center',
      letterSpacing: '1px',
      lineHeight: '14px',
    }}>
      <PixelIcon weatherText={display} />
      {parts.map((p, i) => (
        <span key={i} style={{
          color: i === 0 ? 'var(--accent-glow)' : i === 1 ? 'var(--text-primary)' : 'var(--text-dim)',
        }}>
          {p}
        </span>
      ))}
    </div>
  );
}
