import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { WS_URL } from '../config.js';

export function useSocket() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io(WS_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      // Match server's fast ping settings for quick disconnect detection
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    // Also set false on connection errors (server dead / unreachable)
    s.on('connect_error', () => setConnected(false));
    s.io.on('reconnect_error', () => setConnected(false));
    s.io.on('reconnect_failed', () => setConnected(false));

    return () => {
      s.disconnect();
      s.removeAllListeners();
    };
  }, []);

  return { socket, connected };
}
