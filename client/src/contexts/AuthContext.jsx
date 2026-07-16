import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ socket, children }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const speechAudioRef = useRef(null);

  // Check auth status on mount
  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(data => setLoggedIn(data.loggedIn))
      .catch(() => {});
  }, []);

  const loginPhone = useCallback((phone, password) => {
    if (speechAudioRef.current) speechAudioRef.current.play().catch(() => {});
    if (socket) socket.emit('auth:login-phone', { phone, password });
  }, [socket]);

  const loginQr = useCallback(() => {
    if (speechAudioRef.current) speechAudioRef.current.play().catch(() => {});
    if (socket) socket.emit('auth:login-qr-start');
  }, [socket]);

  const logout = useCallback(() => {
    setLoggedIn(false);
  }, []);

  const value = {
    loggedIn,
    setLoggedIn,
    loginPhone,
    loginQr,
    logout,
    speechAudioRef,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
