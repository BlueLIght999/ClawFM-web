import { useEffect } from 'react';

/**
 * Sends browser geolocation to server for accurate weather data.
 * Silently ignores denial or unavailable geolocation.
 */
export function useGeolocation(socket, connected) {
  useEffect(() => {
    if (!socket || !connected || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        socket.emit('location:update', { lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30 * 60 * 1000 },
    );
  }, [socket, connected]);
}
