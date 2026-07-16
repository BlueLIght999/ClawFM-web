import { createContext, useContext, useState, useCallback, useEffect, useTransition } from 'react';

const UIContext = createContext(null);

export function UIProvider({ socket, children }) {
  const [view, setView] = useState('player');
  const [isViewTransitionPending, startViewTransition] = useTransition();
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  const [weather, setWeather] = useState('');
  const [proactiveEnabled, setProactiveEnabled] = useState(true);
  const [ttsStatus, setTtsStatus] = useState({ available: null, provider: null, reason: '' });

  // Fetch weather on mount and refresh every 15min
  useEffect(() => {
    const fetchWeather = () => {
      fetch('/api/weather').then(r => r.json()).then(data => {
        if (data.text) setWeather(data.text);
      }).catch(() => {});
    };
    fetchWeather();
    const t = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch profile data when view changes to 'profile'
  useEffect(() => {
    if (view === 'profile') {
      fetch('/api/taste').then(r => r.json()).then(setProfileData).catch(() => {});
    }
  }, [view]);

  // Fetch initial plan
  useEffect(() => {
    fetch('/api/plan/today').then(r => r.json()).then(data => {
      if (data.blocks) setPlan(data);
    }).catch(() => {});
  }, []);

  const toggleProactive = useCallback(() => {
    setProactiveEnabled(prev => {
      const next = !prev;
      if (socket) socket.emit('proactive:toggle', { enabled: next });
      return next;
    });
  }, [socket]);

  const value = {
    view,
    setView,
    isViewTransitionPending,
    startViewTransition,
    profileData,
    setProfileData,
    plan,
    setPlan,
    weather,
    setWeather,
    proactiveEnabled,
    toggleProactive,
    ttsStatus,
    setTtsStatus,
    error,
    setError,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
