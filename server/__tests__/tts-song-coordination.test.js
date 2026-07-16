import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  classifySpeechCompletion,
  isNoOpCompletion,
} from '../domain/playback/speechCompletionRules.js';
import {
  estimatedSpeechDurationSeconds,
} from '../domain/hosting/djSpeechRules.js';
import { maybeProactiveSpeech, resetLastSpeechTime, setProactiveEnabled, setLastUserChat } from '../services/proactive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Bug #1: Proactive speech completion must not trigger speechComplete ──

describe('Bug #1: proactive speech completion classification', () => {
  it('classifySpeechCompletion_proactive_returnsNoOp', () => {
    expect(classifySpeechCompletion('proactive')).toBe('no-op');
  });

  it('isNoOpCompletion_proactive_returnsTrue', () => {
    expect(isNoOpCompletion('proactive')).toBe(true);
  });

  it('classifySpeechCompletion_transition_stillReturnsNormal', () => {
    expect(classifySpeechCompletion('transition')).toBe('normal');
  });

  it('classifySpeechCompletion_refill_stillReturnsNormal', () => {
    expect(classifySpeechCompletion('refill')).toBe('normal');
  });

  it('classifySpeechCompletion_undefined_stillReturnsNormal', () => {
    expect(classifySpeechCompletion(undefined)).toBe('normal');
  });
});

// ─── Bug #3: Speech duration estimation is more conservative ─────────────

describe('Bug #3: conservative speech duration estimation', () => {
  it('shortText_returnsMinimum3Seconds', () => {
    expect(estimatedSpeechDurationSeconds('hi')).toBe(3);
    expect(estimatedSpeechDurationSeconds('')).toBe(3);
  });

  it('mediumText_usesTwelveCharsPerSecond', () => {
    // 48 chars / 12 = 4 seconds
    expect(estimatedSpeechDurationSeconds('a'.repeat(48))).toBe(4);
  });

  it('longText_scalesCorrectly', () => {
    // 120 chars / 12 = 10 seconds
    expect(estimatedSpeechDurationSeconds('a'.repeat(120))).toBe(10);
  });

  it('isAlwaysAtLeast3Seconds', () => {
    for (let len = 0; len <= 36; len += 6) {
      expect(estimatedSpeechDurationSeconds('x'.repeat(len))).toBeGreaterThanOrEqual(3);
    }
  });
});

// ─── Bug #4: Proactive TTS skipped when transition starts during generation ──

describe('Bug #4: proactive TTS re-checks isAdvancing before sending', () => {
  beforeEach(() => {
    setProactiveEnabled(true);
    resetLastSpeechTime(Date.now() - 120000);
    setLastUserChat(null);
  });

  it('skipsDjSpeechStart_whenTransitionStartedDuringTTS', async () => {
    // Mock Math.random to return < 0.4 so synthesize is called
    const originalRandom = Math.random;
    Math.random = vi.fn(() => 0.3);

    const events = {
      djMessage: vi.fn(),
      djStreamChunk: vi.fn(),
      djStreamEnd: vi.fn(),
      djSpeechStart: vi.fn(),
    };
    const scheduler = {
      coldStartState: 'done',
      isPlaying: true,
      isAdvancing: false, // Not advancing at check time...
      songsSinceLastSpeech: 3,
      currentSong: { id: 's1', title: 'Test', artist: 'Artist' },
    };
    const speech = {
      health: vi.fn(() => ({ available: true })),
      // Simulate TTS taking time, during which isAdvancing becomes true
      synthesize: vi.fn(async () => {
        scheduler.isAdvancing = true; // Transition starts during TTS!
        return 'http://audio.url/tts.mp3';
      }),
    };

    try {
      await maybeProactiveSpeech({
        events,
        scheduler,
        queue: { upcomingSongs: [] },
        getPlan: () => ({ plan: { blocks: [] } }),
        weather: { current: vi.fn(async () => 'sunny') },
        speech,
        decideProactiveSpeech: vi.fn(async () => ({ shouldSpeak: true, message: 'Hello' })),
        tokenDelayMs: 0,
      });

      // djSpeechStart should NOT have been called because isAdvancing became true
      expect(events.djSpeechStart).not.toHaveBeenCalled();
    } finally {
      Math.random = originalRandom;
    }
  });

  it('sendsDjSpeechStart_whenTransitionNotStarted', async () => {
    const originalRandom = Math.random;
    Math.random = vi.fn(() => 0.3);

    const events = {
      djMessage: vi.fn(),
      djStreamChunk: vi.fn(),
      djStreamEnd: vi.fn(),
      djSpeechStart: vi.fn(),
    };
    const scheduler = {
      coldStartState: 'done',
      isPlaying: true,
      isAdvancing: false,
      songsSinceLastSpeech: 3,
      currentSong: { id: 's1', title: 'Test', artist: 'Artist' },
    };
    const speech = {
      health: vi.fn(() => ({ available: true })),
      synthesize: vi.fn(async () => 'http://audio.url/tts.mp3'),
    };

    try {
      await maybeProactiveSpeech({
        events,
        scheduler,
        queue: { upcomingSongs: [] },
        getPlan: () => ({ plan: { blocks: [] } }),
        weather: { current: vi.fn(async () => 'sunny') },
        speech,
        decideProactiveSpeech: vi.fn(async () => ({ shouldSpeak: true, message: 'Hello' })),
        tokenDelayMs: 0,
      });

      expect(events.djSpeechStart).toHaveBeenCalledWith({
        audioUrl: 'http://audio.url/tts.mp3',
        text: 'Hello',
        type: 'proactive',
      });
    } finally {
      Math.random = originalRandom;
    }
  });
});

// ─── Bug #5: staleSpeech handler calls speechComplete immediately ─────────

describe('Bug #5: handler calls speechComplete on staleSpeech', () => {
  it('handler_callsSpeechComplete_whenSpeechHandledIsFalse', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../socket/handler.js'), 'utf-8',
    );

    // Find the onDjSpeechNeeded handler
    const speechStart = source.indexOf('scheduler.onDjSpeechNeeded');
    const stateChangeStart = source.indexOf('scheduler.onStateChange');
    const speechBlock = source.slice(speechStart, stateChangeStart);

    // Should contain speechComplete call when speechHandled is false
    expect(speechBlock).toContain('!speechHandled');
    expect(speechBlock).toContain('scheduler.speechComplete()');
  });
});

// ─── Bug #6: onSongChange sends SONG_CHANGE before getAudioUrl ────────────

describe('Bug #6: onSongChange sends SONG_CHANGE immediately', () => {
  it('handler_emitsSongChangeBeforeGetAudioUrl', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../socket/handler.js'), 'utf-8',
    );

    // Find the onSongChange handler
    const songChangeStart = source.indexOf('scheduler.onSongChange');
    const speechStart = source.indexOf('scheduler.onDjSpeechNeeded');
    const songBlock = source.slice(songChangeStart, speechStart);

    // SONG_CHANGE should be emitted before getAudioUrl
    const emitPos = songBlock.indexOf('io.emit(EVENTS.SONG_CHANGE');
    const getUrlPos = songBlock.indexOf('scheduler.getAudioUrl');
    expect(emitPos).toBeGreaterThan(-1);
    expect(getUrlPos).toBeGreaterThan(-1);
    expect(emitPos).toBeLessThan(getUrlPos);
  });

  it('handler_emitsRadioState_afterGetAudioUrl', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../socket/handler.js'), 'utf-8',
    );

    const songChangeStart = source.indexOf('scheduler.onSongChange');
    const speechStart = source.indexOf('scheduler.onDjSpeechNeeded');
    const songBlock = source.slice(songChangeStart, speechStart);

    // Should emit RADIO_STATE with audioUrl after fetch
    expect(songBlock).toContain('EVENTS.RADIO_STATE');
    expect(songBlock).toContain('audioUrl');
  });
});

// ─── Bug #2: Client SONG_CHANGE defers when speech is playing ─────────────

describe('Bug #2: client defers SONG_CHANGE during speech', () => {
  it('appjsx_hasDjSpeechUrlRef', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/App.jsx'), 'utf-8',
    );

    expect(source).toContain('djSpeechUrlRef');
    expect(source).toContain('pendingSongChangeRef');
  });

  it('appjsx_songChangeChecksDjSpeechUrlRef', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/App.jsx'), 'utf-8',
    );

    // SONG_CHANGE handler should check djSpeechUrlRef.current
    const songChangeIdx = source.indexOf("socket.on(E.SONG_CHANGE");
    const djSpeechStartIdx = source.indexOf("socket.on(E.DJ_MESSAGE");
    const songBlock = source.slice(songChangeIdx, djSpeechStartIdx);

    expect(songBlock).toContain('djSpeechUrlRef.current');
    expect(songBlock).toContain('pendingSongChangeRef');
  });

  it('appjsx_finishClearsDjSpeechUrlRef', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/App.jsx'), 'utf-8',
    );

    // Find the finish function
    const finishIdx = source.indexOf('const finish = () => {');
    expect(finishIdx).toBeGreaterThan(-1);
    const finishBlock = source.slice(finishIdx, finishIdx + 800);

    expect(finishBlock).toContain('djSpeechUrlRef.current = null');
    expect(finishBlock).toContain('pendingSongChangeRef');
  });
});
