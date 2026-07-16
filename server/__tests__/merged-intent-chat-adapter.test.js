import { describe, it, expect, vi } from 'vitest';
import { createMergedIntentChatAdapter } from '../agent/infrastructure/MergedIntentChatAdapter.js';

async function* rawStream(tokens) {
  for (const t of tokens) {
    yield { choices: [{ delta: { content: t } }] };
  }
}

describe('MergedIntentChatAdapter', () => {
  it('streamWithIntent_normalFlow_resolvesIntentAndYieldsReply', async () => {
    const llm = {
      streamRaw: vi.fn(async () => rawStream([
        '{"action":"chat","params":{}}',
        '|||',
        '你好！',
      ])),
    };
    const adapter = createMergedIntentChatAdapter({ llm });

    const { intent, stream } = await adapter.streamWithIntent([{ role: 'user', content: 'hi' }]);
    const replyTokens = [];
    for await (const t of stream) replyTokens.push(t);

    expect(await intent).toEqual({ action: 'chat', params: {} });
    expect(replyTokens.join('')).toBe('你好！');
  });

  it('streamWithIntent_nullStream_resolvesFallbackIntent', async () => {
    const llm = { streamRaw: vi.fn(async () => null) };
    const adapter = createMergedIntentChatAdapter({ llm });

    const { intent, stream } = await adapter.streamWithIntent([]);
    expect(await intent).toEqual({ action: 'chat', params: {} });
    expect(stream).toBeNull();
  });

  it('streamWithIntent_intentAcrossTokens_correctlyJoins', async () => {
    const llm = {
      streamRaw: vi.fn(async () => rawStream([
        '{"action":"play_mood","params":{"mood":"happy"}}|||让我来挑歌。',
      ])),
    };
    const adapter = createMergedIntentChatAdapter({ llm });

    const { intent, stream } = await adapter.streamWithIntent([]);
    const tokens = [];
    for await (const t of stream) tokens.push(t);

    expect((await intent).action).toBe('play_mood');
    expect(tokens.join('')).toBe('让我来挑歌。');
  });

  it('streamWithIntent_noSeparator_flushesFallbackIntent', async () => {
    const llm = {
      streamRaw: vi.fn(async () => rawStream(['just some text without separator'])),
    };
    const adapter = createMergedIntentChatAdapter({ llm });

    const { intent, stream } = await adapter.streamWithIntent([]);
    for await (const _ of stream) { /* consume */ }

    expect(await intent).toEqual({ action: 'chat', params: {} });
  });

  it('streamWithIntent_multipleReplyTokens_yieldedInOrder', async () => {
    const llm = {
      streamRaw: vi.fn(async () => rawStream([
        '{"action":"chat"}|||',
        '第一句。',
        '第二句！',
      ])),
    };
    const adapter = createMergedIntentChatAdapter({ llm });

    const { stream } = await adapter.streamWithIntent([]);
    const tokens = [];
    for await (const t of stream) tokens.push(t);

    expect(tokens).toEqual(['第一句。', '第二句！']);
  });

  it('streamWithIntent_intentResolvesWithoutIteratingStreamFirst', async () => {
    const llm = {
      streamRaw: vi.fn(async () => rawStream([
        '{"action":"play_mood","params":{"mood":"happy"}}|||让我来挑歌。',
      ])),
    };
    const adapter = createMergedIntentChatAdapter({ llm });

    const { intent, stream } = await adapter.streamWithIntent([]);
    // Key assertion: await intent WITHOUT iterating stream first
    // This would deadlock with the old lazy-generator implementation
    const resolvedIntent = await intent;

    expect(resolvedIntent).toEqual({ action: 'play_mood', params: { mood: 'happy' } });

    // Stream tokens are still available after intent resolves
    const tokens = [];
    for await (const t of stream) tokens.push(t);
    expect(tokens.join('')).toBe('让我来挑歌。');
  });
});
