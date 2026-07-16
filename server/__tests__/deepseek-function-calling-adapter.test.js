import { describe, it, expect, vi } from 'vitest';
import { createDeepSeekFunctionCallingAdapter } from '../agent/infrastructure/DeepSeekFunctionCallingAdapter.js';

function createMockClient(response) {
  return {
    chat: {
      completions: {
        create: vi.fn(async () => response),
      },
    },
  };
}

describe('DeepSeekFunctionCallingAdapter', () => {
  it('completeWithTools_nullClient_returnsNull', async () => {
    const adapter = createDeepSeekFunctionCallingAdapter({ client: null });
    const result = await adapter.completeWithTools({ messages: [], tools: [] });
    expect(result).toBeNull();
  });

  it('completeWithTools_sendsToolsInOpenAiFormat', async () => {
    const client = createMockClient({
      choices: [{ message: { content: 'hello', tool_calls: [] } }],
    });
    const adapter = createDeepSeekFunctionCallingAdapter({ client });
    await adapter.completeWithTools({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'skip', description: 'Skip song', parameters: { type: 'object', properties: {} } }],
    });
    const callArgs = client.chat.completions.create.mock.calls[0][0];
    expect(callArgs.tools).toHaveLength(1);
    expect(callArgs.tools[0].type).toBe('function');
    expect(callArgs.tools[0].function.name).toBe('skip');
  });

  it('completeWithTools_parsesToolCalls', async () => {
    const client = createMockClient({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            function: { name: 'search_music', arguments: '{"query":"周杰伦"}' },
          }],
        },
      }],
    });
    const adapter = createDeepSeekFunctionCallingAdapter({ client });
    const result = await adapter.completeWithTools({ messages: [], tools: [] });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('search_music');
    expect(result.toolCalls[0].arguments).toEqual({ query: '周杰伦' });
  });

  it('completeWithTools_invalidJsonArguments_returnsEmptyObject', async () => {
    const client = createMockClient({
      choices: [{
        message: {
          content: null,
          tool_calls: [{ function: { name: 'skip', arguments: 'not json' } }],
        },
      }],
    });
    const adapter = createDeepSeekFunctionCallingAdapter({ client });
    const result = await adapter.completeWithTools({ messages: [], tools: [] });
    expect(result.toolCalls[0].arguments).toEqual({});
  });

  it('completeWithTools_apiError_returnsNull', async () => {
    const client = {
      chat: { completions: { create: vi.fn(async () => { throw new Error('API down'); }) } },
    };
    const adapter = createDeepSeekFunctionCallingAdapter({ client });
    const result = await adapter.completeWithTools({ messages: [], tools: [] });
    expect(result).toBeNull();
  });

  it('isConfigured_withClient_returnsTrue', () => {
    const adapter = createDeepSeekFunctionCallingAdapter({ client: createMockClient({}) });
    expect(adapter.isConfigured()).toBe(true);
  });

  it('isConfigured_withoutClient_returnsFalse', () => {
    const adapter = createDeepSeekFunctionCallingAdapter({ client: null });
    expect(adapter.isConfigured()).toBe(false);
  });

  it('completeWithTools_noMessageInResponse_returnsNull', async () => {
    const client = createMockClient({ choices: [] });
    const adapter = createDeepSeekFunctionCallingAdapter({ client });
    const result = await adapter.completeWithTools({ messages: [], tools: [] });
    expect(result).toBeNull();
  });
});
