import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGeolocation } from '../hooks/useGeolocation.js';

describe('useGeolocation', () => {
  let socketMock;
  let originalGeolocation;

  beforeEach(() => {
    socketMock = { emit: vi.fn() };
    originalGeolocation = navigator.geolocation;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: originalGeolocation,
      configurable: true,
    });
  });

  function mockGeolocation(success) {
    const getCurrentPosition = vi.fn((onSuccess, onError) => {
      if (success) {
        onSuccess({ coords: { latitude: 39.9, longitude: 116.4 } });
      } else {
        onError(new Error('denied'));
      }
    });
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });
    return getCurrentPosition;
  }

  it('doesNothing_whenSocketIsNull', () => {
    mockGeolocation(true);
    renderHook(() => useGeolocation(null, true));
    // Should not crash
  });

  it('doesNothing_whenNotConnected', () => {
    mockGeolocation(true);
    renderHook(() => useGeolocation(socketMock, false));
    expect(socketMock.emit).not.toHaveBeenCalled();
  });

  it('doesNothing_whenGeolocationUnavailable', () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      configurable: true,
    });
    renderHook(() => useGeolocation(socketMock, true));
    expect(socketMock.emit).not.toHaveBeenCalled();
  });

  it('emitsLocationUpdate_whenGeolocationSucceeds', () => {
    mockGeolocation(true);
    renderHook(() => useGeolocation(socketMock, true));
    expect(socketMock.emit).toHaveBeenCalledWith('location:update', { lat: 39.9, lon: 116.4 });
  });

  it('silentlyIgnores_whenGeolocationDenied', () => {
    mockGeolocation(false);
    renderHook(() => useGeolocation(socketMock, true));
    expect(socketMock.emit).not.toHaveBeenCalled();
  });

  it('passesHighAccuracyOptions', () => {
    const getCurrentPosition = mockGeolocation(true);
    renderHook(() => useGeolocation(socketMock, true));
    const options = getCurrentPosition.mock.calls[0][2];
    expect(options.enableHighAccuracy).toBe(true);
    expect(options.timeout).toBe(10000);
    expect(options.maximumAge).toBe(30 * 60 * 1000);
  });
});
