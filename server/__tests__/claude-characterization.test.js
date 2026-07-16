import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock infrastructure dependencies
vi.mock('../infrastructure/llm/djPersonaLoader.js', () => ({
  loadDjPersona: () => '你是 Dan，Qclaudio 88.7 电台的 AI DJ。请用中文进行所有播报。',
}));

vi.mock('../infrastructure/llm/DeepSeekLlmAdapter.js', () => ({
  deepSeekLlmAdapter: {
    complete: vi.fn(),
    stream: vi.fn(),
    isConfigured: vi.fn(() => true),
  },
}));

vi.mock('../infrastructure/llm/llmClient.js', () => ({
  llmClient: {
    chat: { completions: { create: vi.fn() } },
  },
}));

vi.mock('../infrastructure/persistence/repositories/LegacyChatHistoryRepository.js', () => ({
  legacyChatHistoryRepository: {
    recent: vi.fn(() => []),
    append: vi.fn(),
  },
}));

vi.mock('../infrastructure/persistence/repositories/LegacyListenerProfileRepository.js', () => ({
  legacyListenerProfileRepository: {
    get: vi.fn(() => ({ topArtists: [], analysis: {} })),
  },
}));

const { deepSeekLlmAdapter } = await import('../infrastructure/llm/DeepSeekLlmAdapter.js');
const { legacyChatHistoryRepository } = await import('../infrastructure/persistence/repositories/LegacyChatHistoryRepository.js');
const { legacyListenerProfileRepository } = await import('../infrastructure/persistence/repositories/LegacyListenerProfileRepository.js');
const { loadDjPersona } = await import('../infrastructure/llm/djPersonaLoader.js');
const { llmClient } = await import('../infrastructure/llm/llmClient.js');

// Import after mocks are set up
const {
  generateDjResponse,
  extractIntent,
  analyzeHabits,
  generateColdOpen,
  generateRefillSpeech,
  generateTransition,
  decideProactiveSpeech,
  isConfigured,
  configureClaude,
} = await import('../services/claude.js');

// Inject mocked dependencies (D8 compliance — claude.js no longer imports infrastructure directly)
configureClaude({
  persona: loadDjPersona(),
  llm: deepSeekLlmAdapter,
  llmClient,
  chatHistory: legacyChatHistoryRepository,
  profile: legacyListenerProfileRepository,
});

describe('claude.js characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deepSeekLlmAdapter.isConfigured.mockReturnValue(true);
  });

  describe('isConfigured', () => {
    it('delegates to deepSeekLlmAdapter', () => {
      deepSeekLlmAdapter.isConfigured.mockReturnValue(true);
      expect(isConfigured()).toBe(true);
      deepSeekLlmAdapter.isConfigured.mockReturnValue(false);
      expect(isConfigured()).toBe(false);
    });
  });

  describe('generateDjResponse', () => {
    it('returns parsed JSON when LLM returns valid JSON', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue('{"say":"hello","play":[],"reason":"test","segue":""}');
      const result = await generateDjResponse({ userInput: 'play something' });
      expect(result.say).toBe('hello');
    });

    it('returns text fallback when JSON parse fails', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue('just text');
      const result = await generateDjResponse({ userInput: 'hi' });
      expect(result.say).toBe('just text');
      expect(result.play).toEqual([]);
    });

    it('returns fallbackTransition when LLM returns null', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue(null);
      const result = await generateDjResponse({ prevSong: { name: 'A' }, nextSong: { name: 'B' } });
      expect(result).toBeTruthy();
      expect(result.say).toBeTruthy();
    });

    it('includes chat history in messages', async () => {
      legacyChatHistoryRepository.recent.mockReturnValue([
        { role: 'user', content: 'previous message' },
      ]);
      deepSeekLlmAdapter.complete.mockResolvedValue('{"say":"ok"}');
      await generateDjResponse({ userInput: 'test' });
      const messages = deepSeekLlmAdapter.complete.mock.calls[0][0];
      expect(messages.some(m => m.content === 'previous message')).toBe(true);
    });

    it('includes assembledPrompt as system message', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue('{"say":"ok"}');
      await generateDjResponse({ userInput: 'test', assembledPrompt: 'CUSTOM PROMPT' });
      const messages = deepSeekLlmAdapter.complete.mock.calls[0][0];
      expect(messages.some(m => m.content === 'CUSTOM PROMPT')).toBe(true);
    });
  });

  describe('extractIntent', () => {
    it('returns none when LLM not configured', async () => {
      deepSeekLlmAdapter.isConfigured.mockReturnValue(false);
      const result = await extractIntent('play something');
      expect(result.action).toBe('none');
    });

    it('returns parsed intent from LLM', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue('{"action":"play_mood","params":{"mood":"happy"}}');
      const result = await extractIntent('play happy music');
      expect(result.action).toBe('play_mood');
      expect(result.params.mood).toBe('happy');
    });

    it('returns none when JSON parse fails', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue('not json');
      const result = await extractIntent('test');
      expect(result.action).toBe('none');
    });

    it('includes top artists in context', async () => {
      legacyListenerProfileRepository.get.mockReturnValue({
        topArtists: [{ name: 'Artist1', count: 5 }],
        analysis: {},
      });
      deepSeekLlmAdapter.complete.mockResolvedValue('{"action":"chat"}');
      await extractIntent('hi');
      const messages = deepSeekLlmAdapter.complete.mock.calls[0][0];
      expect(messages.some(m => m.content.includes('Artist1'))).toBe(true);
    });
  });

  describe('analyzeHabits', () => {
    it('returns null when LLM not configured', async () => {
      deepSeekLlmAdapter.isConfigured.mockReturnValue(false);
      const result = await analyzeHabits();
      expect(result).toBeNull();
    });

    it('returns LLM text response', async () => {
      legacyListenerProfileRepository.get.mockReturnValue({
        topArtists: [{ name: 'A', count: 3 }],
        analysis: { totalSongs: 10, topGenres: [{ name: 'rock' }] },
      });
      deepSeekLlmAdapter.complete.mockResolvedValue('You love rock music!');
      const result = await analyzeHabits();
      expect(result).toBe('You love rock music!');
    });
  });

  describe('generateColdOpen', () => {
    it('returns parsed JSON when LLM succeeds', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue('{"say":"Welcome!"}');
      const result = await generateColdOpen({ name: 'Song1' }, 'sunny', 'morning');
      expect(result.say).toBe('Welcome!');
    });

    it('returns fallback when LLM returns null', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue(null);
      const result = await generateColdOpen({ name: 'Song1' }, null, null);
      expect(result.say).toContain('欢迎收听 Qclaudio');
      expect(result.say).toContain('Song1');
    });

    it('returns text fallback when JSON parse fails', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue('Just a welcome text');
      const result = await generateColdOpen({ name: 'Song1' }, null, null);
      expect(result.say).toBe('Just a welcome text');
    });
  });

  describe('generateRefillSpeech', () => {
    it('returns parsed JSON when LLM succeeds', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue('{"say":"Fresh tracks!"}');
      const result = await generateRefillSpeech([{ name: 'A' }], 'sunny', 'morning');
      expect(result.say).toBe('Fresh tracks!');
    });

    it('returns fallback when LLM returns null', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue(null);
      const result = await generateRefillSpeech([], null, null);
      expect(result.say).toContain('新的歌曲已经排好了');
    });
  });

  describe('generateTransition (backward compat)', () => {
    it('delegates to generateDjResponse', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue('{"say":"transition"}');
      const result = await generateTransition({ name: 'A' }, { name: 'B' }, 'morning', 'prompt');
      expect(result.say).toBe('transition');
    });
  });

  describe('decideProactiveSpeech', () => {
    it('returns null when LLM not configured', async () => {
      deepSeekLlmAdapter.isConfigured.mockReturnValue(false);
      const result = await decideProactiveSpeech({});
      expect(result).toBeNull();
    });

    it('returns parsed JSON decision', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue('{"shouldSpeak":true,"message":"hi"}');
      const result = await decideProactiveSpeech({ lastSpeechTime: 0 });
      expect(result.shouldSpeak).toBe(true);
    });

    it('strips markdown code fences', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue('```json\n{"shouldSpeak":false}\n```');
      const result = await decideProactiveSpeech({});
      expect(result.shouldSpeak).toBe(false);
    });

    it('returns null when JSON parse fails', async () => {
      deepSeekLlmAdapter.complete.mockResolvedValue('not json at all');
      const result = await decideProactiveSpeech({});
      expect(result).toBeNull();
    });
  });
});
