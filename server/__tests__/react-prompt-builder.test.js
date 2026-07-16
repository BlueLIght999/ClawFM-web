import { describe, it, expect } from 'vitest';
import { buildReactSystemPrompt, buildUserMessage, buildReactMessages } from '../agent/domain/reactPromptBuilder.js';

describe('ReactPromptBuilder', () => {
  describe('buildReactSystemPrompt', () => {
    it('includesPersonaAndContext', () => {
      const prompt = buildReactSystemPrompt('你是DJ小明。', '天气：晴 26°C');
      expect(prompt).toContain('你是DJ小明。');
      expect(prompt).toContain('天气：晴 26°C');
    });

    it('includesToolUsageGuidelines', () => {
      const prompt = buildReactSystemPrompt('persona', 'context');
      expect(prompt).toContain('工具使用指南');
      expect(prompt).toContain('search_music');
      expect(prompt).toContain('recommend');
    });

    it('includesChineseInstructions', () => {
      const prompt = buildReactSystemPrompt('persona', 'context');
      expect(prompt).toContain('电台');
      expect(prompt).toContain('中文');
    });
  });

  describe('buildUserMessage', () => {
    it('returnsUserRoleWithContent', () => {
      const msg = buildUserMessage('你好');
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('你好');
    });
  });

  describe('buildReactMessages', () => {
    it('withoutHistory_returnsSystemAndUser', () => {
      const messages = buildReactMessages('persona', 'ctx', '你好');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toBe('你好');
    });

    it('withHistory_includesHistoryBetweenSystemAndUser', () => {
      const history = [
        { role: 'user', content: '上一句' },
        { role: 'assistant', content: '回复' },
      ];
      const messages = buildReactMessages('persona', 'ctx', '新消息', history);
      expect(messages).toHaveLength(4);
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toBe('上一句');
      expect(messages[2].content).toBe('回复');
      expect(messages[3].role).toBe('user');
      expect(messages[3].content).toBe('新消息');
    });
  });
});
