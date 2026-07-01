import { useState, useEffect } from 'react';

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const h = time.getHours().toString().padStart(2, '0');
  const m = time.getMinutes().toString().padStart(2, '0');
  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const d = days[time.getDay()];
  const mon = months[time.getMonth()];
  const day = time.getDate();
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-secondary)', flexShrink: 0 }}>
      {h}:{m} {d} {mon} {day}
    </span>
  );
}

export default function TopBar({ radioName, freq, connected, view, onViewChange, weather, ttsStatus }) {
  const tabs = [
    { id: 'player', label: 'FM' },
    { id: 'profile', label: 'ME' },
    { id: 'settings', label: 'SET' },
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '2px 8px',
      borderBottom: '1px solid var(--border-dim)',
      background: 'var(--bg-secondary)',
      minHeight: 24,
      gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span className="pixel-title">{radioName}</span>
        <span style={{
          fontFamily: 'var(--font-pixel)', fontSize: 8,
          color: 'var(--neon-cyan)',
        }}>{freq}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {weather && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', marginRight: 4 }}>
            {weather}
          </span>
        )}
        <Clock />
      </div>

      <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => onViewChange?.(tab.id)}
            className="pixel-btn" style={{
              fontSize: 8, padding: '1px 4px',
              borderColor: view === tab.id ? 'var(--accent)' : 'var(--border-dim)',
              color: view === tab.id ? 'var(--accent)' : 'var(--text-dim)',
            }}>{tab.label}</button>
        ))}
        <div style={{
          width: 5, height: 5, marginLeft: 3,
          background: connected ? '#00ccff' : '#ff3333',
          boxShadow: connected ? '0 0 3px #00ccff' : '0 0 3px #ff3333',
        }} title="Connection" />
        {/* TTS status dot */}
        <div style={{
          width: 5, height: 5, marginLeft: 1,
          background: ttsStatus?.available === false ? '#ffaa00'
            : ttsStatus?.provider === 'edge' ? '#ffcc00'
            : ttsStatus?.provider === 'dashscope' ? '#00ff66'
            : '#555555',
          boxShadow: ttsStatus?.available === false ? '0 0 3px #ffaa00'
            : ttsStatus?.provider === 'edge' ? '0 0 3px #ffcc00'
            : ttsStatus?.provider === 'dashscope' ? '0 0 3px #00ff66'
            : 'none',
        }} title={`TTS: ${ttsStatus?.provider || (ttsStatus?.available === false ? 'offline' : 'checking...')}${ttsStatus?.reason ? ' — ' + ttsStatus.reason : ''}`} />
      </div>
    </div>
  );
}
