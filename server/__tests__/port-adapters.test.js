import { describe, it, expect, vi } from 'vitest';
import { createLegacyWeatherAdapter } from '../infrastructure/environment/LegacyWeatherAdapter.js';
import { createLegacySpeechSynthAdapter } from '../infrastructure/speech/LegacySpeechSynthAdapter.js';
import { createDeepSeekLlmAdapter } from '../infrastructure/llm/DeepSeekLlmAdapter.js';
import { SocketEventPublisher } from '../socket/SocketEventPublisher.js';

describe('WeatherPort adapter', () => {
  it('currentAndSetClientLocation_delegateToLegacyWeatherService', async () => {
    const setClientLocation = vi.fn();
    const adapter = createLegacyWeatherAdapter({
      getWeather: async () => 'Xi-an, 23C, cloudy',
      setClientLocation,
    });

    await expect(adapter.current()).resolves.toBe('Xi-an, 23C, cloudy');
    adapter.setClientLocation(34.2, 108.9);

    expect(setClientLocation).toHaveBeenCalledWith(34.2, 108.9);
  });
});

describe('SpeechSynthPort adapter', () => {
  it('synthesizeAndHealth_delegateToLegacyTtsService', async () => {
    const adapter = createLegacySpeechSynthAdapter({
      generateSpeech: async (text) => `/audio/tts/${text}.mp3`,
      getTtsStatus: () => ({ available: true, provider: 'edge', reason: '' }),
    });

    await expect(adapter.synthesize('hello')).resolves.toBe('/audio/tts/hello.mp3');
    expect(adapter.health()).toEqual({ available: true, provider: 'edge', reason: '' });
  });

  it('synthesize_whenLegacyServiceThrows_returnsNull', async () => {
    const adapter = createLegacySpeechSynthAdapter({
      generateSpeech: async () => { throw new Error('provider down'); },
      getTtsStatus: () => ({ available: false, provider: null, reason: 'provider down' }),
    });

    await expect(adapter.synthesize('hello')).resolves.toBeNull();
  });
});

describe('LlmPort adapter', () => {
  it('unconfiguredClient_returnsNullAndIsConfiguredFalse', async () => {
    const adapter = createDeepSeekLlmAdapter({ client: null, model: 'deepseek-chat' });

    expect(adapter.isConfigured()).toBe(false);
    await expect(adapter.complete([{ role: 'user', content: 'hi' }])).resolves.toBeNull();
    await expect(adapter.stream([{ role: 'user', content: 'hi' }])).resolves.toBeNull();
  });

  it('complete_delegatesToChatCompletionsWithJsonMode', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
    });
    const adapter = createDeepSeekLlmAdapter({
      client: { chat: { completions: { create } } },
      model: 'deepseek-chat',
    });

    await expect(adapter.complete([{ role: 'user', content: 'hi' }], { jsonMode: true }))
      .resolves.toBe('{"ok":true}');

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }],
      response_format: { type: 'json_object' },
      stream: false,
    }));
  });
});

describe('EventPublisher adapter', () => {
  it('emitAndToClient_delegateToSocketIo', () => {
    const clientEmit = vi.fn();
    const io = {
      emit: vi.fn(),
      to: vi.fn(() => ({ emit: clientEmit })),
    };
    const publisher = new SocketEventPublisher(io);

    publisher.emit('radio:test', { ok: true });
    publisher.toClient('socket-1', 'radio:private', { private: true });

    expect(io.emit).toHaveBeenCalledWith('radio:test', { ok: true });
    expect(io.to).toHaveBeenCalledWith('socket-1');
    expect(clientEmit).toHaveBeenCalledWith('radio:private', { private: true });
  });
});
