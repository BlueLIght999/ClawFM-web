import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  maybeProactiveSpeech,
  resetLastSpeechTime,
  setProactiveEnabled,
} from '../services/proactive.js';

describe('maybeProactiveSpeech ports', () => {
  beforeEach(() => {
    setProactiveEnabled(true);
    resetLastSpeechTime(Date.now() - 120000);
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('usesInjectedWeatherAndSpeechPortsForProactiveSpeech', async () => {
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
      songsSinceLastSpeech: 2,
      currentSong: { title: 'Song', artist: 'Artist' },
    };
    const queue = { upcomingSongs: [{ title: 'Next' }] };
    const weather = { current: vi.fn(async () => 'Injected Weather') };
    const speech = {
      health: vi.fn(() => ({ available: true, provider: 'fake', reason: '' })),
      synthesize: vi.fn(async () => '/audio/tts/proactive.mp3'),
    };
    const decideProactiveSpeech = vi.fn(async (ctx) => ({
      shouldSpeak: true,
      message: `weather=${ctx.weather}`,
    }));

    await maybeProactiveSpeech({
      events,
      scheduler,
      queue,
      getPlan: () => ({ plan: { blocks: [] } }),
      weather,
      speech,
      decideProactiveSpeech,
      tokenDelayMs: 0,
    });

    expect(weather.current).toHaveBeenCalledOnce();
    expect(decideProactiveSpeech).toHaveBeenCalledWith(expect.objectContaining({
      weather: 'Injected Weather',
    }));
    expect(speech.health).toHaveBeenCalledOnce();
    expect(speech.synthesize).toHaveBeenCalledWith('weather=Injected Weather');
    expect(events.djSpeechStart).toHaveBeenCalledWith({
      audioUrl: '/audio/tts/proactive.mp3',
      text: 'weather=Injected Weather',
      type: 'proactive',
    });
  });
});
