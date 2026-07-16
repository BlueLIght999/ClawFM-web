import { describe, it, expect } from 'vitest';
import {
  hasToolCalls,
  shouldStop,
  buildAssistantMessage,
  formatToolMessage,
  buildFinalResult,
  singleChunkStream,
} from '../agent/domain/reactLoopRules.js';
import { createAgentLoopState } from '../agent/domain/agentLoopState.js';

describe('ReactLoopRules', () => {
  describe('hasToolCalls', () => {
    it('responseWithToolCalls_returnsTrue', () => {
      expect(hasToolCalls({ content: null, toolCalls: [{ name: 'skip', arguments: {} }] })).toBe(true);
    });

    it('responseWithEmptyToolCalls_returnsFalse', () => {
      expect(hasToolCalls({ content: 'hello', toolCalls: [] })).toBe(false);
    });

    it('nullResponse_returnsFalse', () => {
      expect(hasToolCalls(null)).toBe(false);
    });
  });

  describe('shouldStop', () => {
    it('nullResponse_returnsTrue', () => {
      const state = createAgentLoopState(5);
      state.start();
      expect(shouldStop(null, state)).toBe(true);
    });

    it('noToolCalls_returnsTrue', () => {
      const state = createAgentLoopState(5);
      state.start();
      expect(shouldStop({ content: 'hi', toolCalls: [] }, state)).toBe(true);
    });

    it('hasToolCallsAndCanContinue_returnsFalse', () => {
      const state = createAgentLoopState(5);
      state.start();
      expect(shouldStop({ content: null, toolCalls: [{ name: 'skip', arguments: {} }] }, state)).toBe(false);
    });

    it('hasToolCallsButMaxIterations_returnsTrue', () => {
      const state = createAgentLoopState(1);
      state.start();
      state.recordThought('t1');
      state.recordAction({});
      state.recordObservation({});
      expect(shouldStop({ content: null, toolCalls: [{ name: 'skip', arguments: {} }] }, state)).toBe(true);
    });
  });

  describe('buildAssistantMessage', () => {
    it('withToolCalls_includesToolCallsArray', () => {
      const msg = buildAssistantMessage({
        content: null,
        toolCalls: [{ name: 'skip', arguments: {} }],
      });
      expect(msg.role).toBe('assistant');
      expect(msg.tool_calls).toHaveLength(1);
      expect(msg.tool_calls[0].function.name).toBe('skip');
      expect(msg.tool_calls[0].function.arguments).toBe('{}');
    });

    it('withoutToolCalls_noToolCallsProperty', () => {
      const msg = buildAssistantMessage({ content: 'hello', toolCalls: [] });
      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('hello');
      expect(msg.tool_calls).toBeUndefined();
    });
  });

  describe('formatToolMessage', () => {
    it('skipResult_summarizesCorrectly', () => {
      const msg = formatToolMessage(
        { handled: true, state: { playbackState: 'playing' } },
        'skip',
        0,
      );
      expect(msg.role).toBe('tool');
      expect(msg.tool_call_id).toBe('call_0');
      expect(msg.content).toContain('skip: done');
    });

    it('searchResult_summarizesWithSongTitles', () => {
      const msg = formatToolMessage(
        { handled: true, results: [{ name: '晴天', ar: [{ name: '周杰伦' }] }] },
        'search_music',
        1,
      );
      expect(msg.content).toContain('晴天');
      expect(msg.content).toContain('周杰伦');
    });

    it('errorResult_summarizesError', () => {
      const msg = formatToolMessage(
        { handled: false, error: 'query is required' },
        'search_music',
        0,
      );
      expect(msg.content).toContain('error');
      expect(msg.content).toContain('query is required');
    });
  });

  describe('buildFinalResult', () => {
    it('returnsStandardShapeWithReactReply', () => {
      const state = createAgentLoopState(5);
      state.start();
      const result = buildFinalResult(
        { content: '好的，已跳过！', toolCalls: [] },
        state,
        { text: '跳过', messageId: 'm1', conversationResults: [], queueUpdate: null, snapshot: null },
      );
      expect(result.handled).toBe(false);
      expect(result.routing.action).toBe('chat');
      expect(result.routing.route).toBe('react');
      expect(result.reactReply).toBe('好的，已跳过！');
      expect(result.streamRequest.messageId).toBe('m1');
    });
  });

  describe('singleChunkStream', () => {
    it('yieldsTextAsSingleChunk', async () => {
      const tokens = [];
      for await (const t of singleChunkStream('你好！')) {
        tokens.push(t);
      }
      expect(tokens).toEqual(['你好！']);
    });

    it('emptyText_yieldsNothing', async () => {
      const tokens = [];
      for await (const t of singleChunkStream('')) {
        tokens.push(t);
      }
      expect(tokens).toEqual([]);
    });
  });
});
