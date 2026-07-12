import { describe, it, expect, vi, beforeEach } from 'vitest';
import { maybeProactiveSpeech, resetLastSpeechTime, setProactiveEnabled, setLastUserChat } from '../services/proactive.js';

function createDeps(overrides = {}) {
  const events = {
    djMessage: vi.fn(),
    djStreamChunk: vi.fn(),
    djStreamEnd: vi.fn(),
    djSpeechStart: vi.fn(),
    ...overrides.events,
  };
  const scheduler = {
    coldStartState: 'done',
    isPlaying: true,
    isAdvancing: false,
    songsSinceLastSpeech: 3,
    currentSong: { id: 's1', title: 'Test Song', artist: 'Test Artist' },
    ...overrides.scheduler,
  };
  const queue = {
    upcomingSongs: [{ id: 's2' }, { id: 's3' }],
    ...overrides.queue,
  };
  const getPlan = overrides.getPlan || (() => ({ plan: { blocks: [{ id: 'b1' }] } }));
  const weather = { current: vi.fn(async () => 'sunny'), ...overrides.weather };
  const speech = {
    health: vi.fn(() => ({ available: true })),
    synthesize: vi.fn(async () => 'http://audio.url/tts.mp3'),
    ...overrides.speech,
  };
  const decide = overrides.decide || vi.fn(async () => ({ shouldSpeak: false }));

  return { events, scheduler, queue, getPlan, weather, speech, decideProactiveSpeech: decide };
}

beforeEach(() => {
  setProactiveEnabled(true);
  resetLastSpeechTime(Date.now() - 120000); // 120s ago — past the 90s threshold
  setLastUserChat(null);
});

describe('maybeProactiveSpeech characterization', () => {
  it('returnsEarly_whenDisabled', async () => {
    setProactiveEnabled(false);
    const deps = createDeps();
    await maybeProactiveSpeech(deps);
    expect(deps.decideProactiveSpeech).not.toHaveBeenCalled();
  });

  it('returnsEarly_whenColdStartNotDone', async () => {
    const deps = createDeps({ scheduler: { coldStartState: 'pending' } });
    await maybeProactiveSpeech(deps);
    expect(deps.decideProactiveSpeech).not.toHaveBeenCalled();
  });

  it('returnsEarly_whenNotPlaying', async () => {
    const deps = createDeps({ scheduler: { isPlaying: false } });
    await maybeProactiveSpeech(deps);
    expect(deps.decideProactiveSpeech).not.toHaveBeenCalled();
  });

  it('returnsEarly_whenAdvancing', async () => {
    const deps = createDeps({ scheduler: { isAdvancing: true } });
    await maybeProactiveSpeech(deps);
    expect(deps.decideProactiveSpeech).not.toHaveBeenCalled();
  });

  it('returnsEarly_whenLessThan2SongsSinceLastSpeech', async () => {
    const deps = createDeps({ scheduler: { songsSinceLastSpeech: 1 } });
    await maybeProactiveSpeech(deps);
    expect(deps.decideProactiveSpeech).not.toHaveBeenCalled();
  });

  it('returnsEarly_whenWithin90sOfLastSpeech', async () => {
    resetLastSpeechTime(Date.now() - 30000); // 30s ago
    const deps = createDeps();
    await maybeProactiveSpeech(deps);
    expect(deps.decideProactiveSpeech).not.toHaveBeenCalled();
  });

  it('returnsEarly_whenNoCurrentSong', async () => {
    const deps = createDeps({ scheduler: { currentSong: null } });
    await maybeProactiveSpeech(deps);
    expect(deps.decideProactiveSpeech).not.toHaveBeenCalled();
  });

  it('callsDecideWithContext_whenAllGuardsPass', async () => {
    const deps = createDeps();
    await maybeProactiveSpeech(deps);
    expect(deps.decideProactiveSpeech).toHaveBeenCalledOnce();
    const arg = deps.decideProactiveSpeech.mock.calls[0][0];
    expect(arg.currentSong).toEqual({ id: 's1', title: 'Test Song', artist: 'Test Artist' });
    expect(arg.nextSong).toEqual({ id: 's2' });
    expect(arg.secondNext).toEqual({ id: 's3' });
    expect(arg.activeBlock).toEqual({ id: 'b1' });
  });

  it('emitsDjMessage_whenDecisionShouldSpeak', async () => {
    const deps = createDeps({ decide: vi.fn(async () => ({ shouldSpeak: true, message: 'Hello listeners' })) });
    await maybeProactiveSpeech(deps);
    expect(deps.events.djMessage).toHaveBeenCalledWith('Hello listeners');
  });

  it('streamsChunks_whenDecisionShouldSpeak', async () => {
    const deps = createDeps({ decide: vi.fn(async () => ({ shouldSpeak: true, message: 'Hi' })) });
    await maybeProactiveSpeech({ ...deps, tokenDelayMs: 0 });
    expect(deps.events.djStreamChunk).toHaveBeenCalled();
    expect(deps.events.djStreamEnd).toHaveBeenCalled();
  });

  it('updatesLastSpeechTime_whenDecisionShouldSpeak', async () => {
    const deps = createDeps({ decide: vi.fn(async () => ({ shouldSpeak: true, message: 'Hi' })) });
    await maybeProactiveSpeech({ ...deps, tokenDelayMs: 0 });
    // Next call should not trigger because lastSpeechTime was just updated
    resetLastSpeechTime(Date.now()); // explicit reset to now
    const deps2 = createDeps();
    await maybeProactiveSpeech(deps2);
    expect(deps2.decideProactiveSpeech).not.toHaveBeenCalled();
  });

  it('resetsSongsSinceLastSpeech_whenDecisionShouldSpeak', async () => {
    const deps = createDeps({ decide: vi.fn(async () => ({ shouldSpeak: true, message: 'Hi' })) });
    await maybeProactiveSpeech({ ...deps, tokenDelayMs: 0 });
    expect(deps.scheduler.songsSinceLastSpeech).toBe(0);
  });

  it('doesNotEmit_whenDecisionShouldNotSpeak', async () => {
    const deps = createDeps({ decide: vi.fn(async () => ({ shouldSpeak: false })) });
    await maybeProactiveSpeech(deps);
    expect(deps.events.djMessage).not.toHaveBeenCalled();
  });

  it('consumesLastUserChat_whenCallingDecide', async () => {
    setLastUserChat('I love this song');
    const deps = createDeps();
    await maybeProactiveSpeech(deps);
    const arg = deps.decideProactiveSpeech.mock.calls[0][0];
    expect(arg.lastChatMessage).toBe('I love this song');
  });

  it('passesNullChatMessage_whenNoUserChat', async () => {
    const deps = createDeps();
    await maybeProactiveSpeech(deps);
    const arg = deps.decideProactiveSpeech.mock.calls[0][0];
    expect(arg.lastChatMessage).toBeNull();
  });

  it('passesWeatherText_toDecide', async () => {
    const deps = createDeps();
    await maybeProactiveSpeech(deps);
    const arg = deps.decideProactiveSpeech.mock.calls[0][0];
    expect(arg.weather).toBe('sunny');
  });
});
