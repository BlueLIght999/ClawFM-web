import { useEffect, useState } from 'react';

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return <span className="topbar-clock">{hours}:{minutes} {days[time.getDay()]} {months[time.getMonth()]} {time.getDate()}</span>;
}

export default function TopBar({ radioName, freq, connected, view, onViewChange, weather, ttsStatus }) {
  const tabs = [
    { id: 'player', label: 'FM' },
    { id: 'profile', label: 'ME' },
    { id: 'settings', label: 'SET' },
  ];
  const ttsLabel = ttsStatus?.provider || (ttsStatus?.available === false ? 'offline' : 'checking');

  return (
    <header className="agent-radio-topbar">
      <div className="topbar-brand-group">
        <span className="topbar-brand">{radioName}</span>
        <span className="topbar-frequency">{freq}</span>
      </div>
      <div className="topbar-meta">
        {weather && <span className="topbar-weather">{weather}</span>}
        <Clock />
      </div>
      <nav className="topbar-navigation" aria-label="Primary views">
        {tabs.map(tab => (
          <button type="button" key={tab.id} onClick={() => onViewChange?.(tab.id)}
            className={`topbar-tab${view === tab.id ? ' active' : ''}`}
            aria-pressed={view === tab.id}>{tab.label}</button>
        ))}
        <span className={`topbar-status ${connected ? 'online' : 'offline'}`}
          role="status" aria-label={connected ? 'Server connected' : 'Server disconnected'} />
        <span className={`topbar-status tts tts-${ttsLabel}`}
          role="status" aria-label={`TTS: ${ttsLabel}`} />
      </nav>
    </header>
  );
}
