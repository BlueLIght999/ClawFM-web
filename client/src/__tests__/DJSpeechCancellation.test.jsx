import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSpeechPlayback } from '../hooks/useSpeechPlayback.js';

/**
 * TDD RED: Test that useSpeechPlayback properly cancels old speech
 * when the URL changes. The bug: old finish() closure fires and
 * corrupts new speech state because resolved is never set to true
 * in the cleanup function.
 */

function createMockAudio() {
  const listeners = {};
  const audio = {
    src: '',
    volume: 1,
    ended: false,
    paused: false,
    onended: null,
    onerror: null,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(() => { audio.paused = true; }),
    load: vi.fn(),
    removeAttribute: vi.fn(),
    addEventListener: vi.fn((event, handler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    removeEventListener: vi.fn((event, handler) => {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(h => h !== handler);
    }),
    dispatchEvent: vi.fn((event) => {
      const type = event.type || event;
      if (listeners[type]) {
        listeners[type].forEach(h => h());
      }
    }),
  };
  return audio;
}

describe('useSpeechPlayback', () => {
  it('pauses old speech and removes src when URL changes', () => {
    const mockAudio = createMockAudio();
    const socket = { emit: vi.fn() };
    const onSpeechEnd = vi.fn();

    const { rerender } = renderHook(
      ({ url }) => useSpeechPlayback({
        djSpeechUrl: url,
        speechAudioRef: { current: mockAudio },
        musicAudioRef: { current: null },
        speechTypeRef: { current: 'transition' },
        socket,
        isPlaying: false,
        onSpeechEnd,
        onDeferredSongChange: vi.fn(),
      }),
      { initialProps: { url: 'http://example.com/speech1.mp3' } }
    );

    // Trigger canplay to start playing speech1
    mockAudio.dispatchEvent({ type: 'canplay' });
    expect(mockAudio.play).toHaveBeenCalled();

    // Change to speech2 — triggers cleanup of speech1
    rerender({ url: 'http://example.com/speech2.mp3' });

    // Old speech should be paused
    expect(mockAudio.pause).toHaveBeenCalled();
    // Old speech src should be removed
    expect(mockAudio.removeAttribute).toHaveBeenCalledWith('src');
  });

  it('neutralizes old finish callback so it does not emit dj-speech-finished', () => {
    const mockAudio = createMockAudio();
    const socket = { emit: vi.fn() };
    const onSpeechEnd = vi.fn();

    const { rerender } = renderHook(
      ({ url }) => useSpeechPlayback({
        djSpeechUrl: url,
        speechAudioRef: { current: mockAudio },
        musicAudioRef: { current: null },
        speechTypeRef: { current: 'transition' },
        socket,
        isPlaying: false,
        onSpeechEnd,
        onDeferredSongChange: vi.fn(),
      }),
      { initialProps: { url: 'http://example.com/speech1.mp3' } }
    );

    // Trigger canplay to start playing
    mockAudio.dispatchEvent({ type: 'canplay' });

    // Capture the old onended handler (the finish closure)
    const oldFinish = mockAudio.onended;
    expect(oldFinish).toBeTruthy();

    // Clear mock calls to isolate old finish behavior
    socket.emit.mockClear();
    onSpeechEnd.mockClear();

    // Change to speech2 — triggers cleanup
    rerender({ url: 'http://example.com/speech2.mp3' });

    // Now call the old finish handler — it should NOT emit
    // because resolved was set to true in cleanup
    oldFinish();

    expect(socket.emit).not.toHaveBeenCalledWith('dj-speech-finished', expect.anything());
    expect(onSpeechEnd).not.toHaveBeenCalled();
  });

  it('emits dj-speech-finished when current speech finishes naturally', () => {
    const mockAudio = createMockAudio();
    const socket = { emit: vi.fn() };
    const onSpeechEnd = vi.fn();

    renderHook(
      () => useSpeechPlayback({
        djSpeechUrl: 'http://example.com/speech1.mp3',
        speechAudioRef: { current: mockAudio },
        musicAudioRef: { current: null },
        speechTypeRef: { current: 'transition' },
        socket,
        isPlaying: false,
        onSpeechEnd,
        onDeferredSongChange: vi.fn(),
      }),
    );

    // Trigger canplay to start playing
    mockAudio.dispatchEvent({ type: 'canplay' });

    // Simulate speech ending naturally
    mockAudio.onended();

    // Should emit dj-speech-finished
    expect(socket.emit).toHaveBeenCalledWith('dj-speech-finished', { type: 'transition' });
    // Should call onSpeechEnd (which clears djSpeechUrl)
    expect(onSpeechEnd).toHaveBeenCalled();
  });
});
