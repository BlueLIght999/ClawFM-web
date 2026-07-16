import { describe, expect, it, vi } from 'vitest';
import { createLegacyStreamingChatAdapter } from '../agent/infrastructure/LegacyStreamingChatAdapter.js';

describe('LegacyStreamingChatAdapter', () => {
  it('stream_delegatesToLegacyChatWithDj', async () => {
    const legacyStream = { [Symbol.asyncIterator]: async function* () {} };
    const chatWithDj = vi.fn(async () => legacyStream);
    const adapter = createLegacyStreamingChatAdapter(chatWithDj);

    await expect(adapter.stream('hello', 'context')).resolves.toBe(legacyStream);
    expect(chatWithDj).toHaveBeenCalledWith('hello', 'context');
  });
});
