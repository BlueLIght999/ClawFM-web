import { useState, useEffect, useCallback, useRef } from 'react';
import { THEME_PALETTES, getTimeTheme } from './themes.js';

const STORAGE_KEY = 'qclaudio-theme-override';
const DEFAULT_THEME = 'cream';

function readStoredOverride() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_THEME;
    const parsed = JSON.parse(stored);
    if (parsed === 'auto') return null;
    return THEME_PALETTES[parsed] ? parsed : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyTheme(themeName) {
  const palette = THEME_PALETTES[themeName];
  if (!palette) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute('data-theme', themeName);
}

export function useTheme() {
  const [autoTheme, setAutoTheme] = useState(() => {
    const now = new Date();
    return getTimeTheme(now.getHours() + now.getMinutes() / 60);
  });

  const [override, setOverride] = useState(readStoredOverride);

  const lastAutoRef = useRef(autoTheme);

  const effectiveTheme = override || autoTheme;

  useEffect(() => {
    applyTheme(effectiveTheme);
  }, [effectiveTheme]);

  // Check every 30s for time boundary crossing
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const hours = now.getHours() + now.getMinutes() / 60;
      const auto = getTimeTheme(hours);

      if (lastAutoRef.current && auto !== lastAutoRef.current) {
        setOverride(null);
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
      }
      lastAutoRef.current = auto;
      setAutoTheme(auto);
    };

    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const setThemeOverride = useCallback((themeName) => {
    setOverride(themeName);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(themeName)); } catch {}
  }, []);

  const clearOverride = useCallback(() => {
    setOverride(null);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify('auto')); } catch {}
  }, []);

  return {
    theme: effectiveTheme,
    autoTheme,
    override,
    setThemeOverride,
    clearOverride,
  };
}
