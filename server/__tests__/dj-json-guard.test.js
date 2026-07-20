import { describe, it, expect } from 'vitest';
import { stripJsonFromText, extractSayFromText, shouldFilterChunk } from '../agent/domain/djJsonGuard.js';

describe('P0: djJsonGuard — prevent JSON from leaking into DJ chat', () => {
  describe('stripJsonFromText', () => {
    it('removes ```json ... ``` code blocks from text', () => {
      const input = '好的，水中スピカ来了！\n```json\n{"say": "hello"}\n```\n接下来...';
      const result = stripJsonFromText(input);
      expect(result).not.toContain('```json');
      expect(result).not.toContain('"say"');
      expect(result).toContain('好的，水中スピカ来了！');
      expect(result).toContain('接下来...');
    });

    it('removes bare JSON objects from text', () => {
      const input = '好的，水中スピカ来了！\n{"say": "hello", "play": [], "reason": "test", "segue": "..."}';
      const result = stripJsonFromText(input);
      expect(result).not.toContain('"say"');
      expect(result).not.toContain('"play"');
      expect(result).toContain('好的，水中スピカ来了！');
    });

    it('preserves normal text without any JSON', () => {
      const input = '这首歌不错，来听听下一首吧。';
      expect(stripJsonFromText(input)).toBe(input);
    });

    it('handles text that is entirely JSON', () => {
      const input = '{"say": "hello", "play": [], "reason": "test", "segue": "..."}';
      const result = stripJsonFromText(input);
      expect(result.trim()).toBe('');
    });

    it('handles multiline JSON objects', () => {
      const input = `好的！
{
  "say": "水中スピカ来了",
  "play": [{"id": "1", "name": "test"}],
  "reason": "test",
  "segue": "transition"
}`;
      const result = stripJsonFromText(input);
      expect(result).not.toContain('"say"');
      expect(result).toContain('好的！');
    });
  });

  describe('extractSayFromText', () => {
    it('extracts say field from valid JSON', () => {
      const input = '{"say": "水中スピカ，名字里就带着水与星辰", "play": [], "reason": "", "segue": ""}';
      const result = extractSayFromText(input);
      expect(result).toBe('水中スピカ，名字里就带着水与星辰');
    });

    it('extracts say from ```json wrapped content', () => {
      const input = '```json\n{"say": "hello world", "play": []}\n```';
      const result = extractSayFromText(input);
      expect(result).toBe('hello world');
    });

    it('returns original text if no JSON found', () => {
      const input = '这是一段普通的DJ台词';
      expect(extractSayFromText(input)).toBe(input);
    });

    it('returns original text if JSON has no say field', () => {
      const input = '{"play": [], "reason": "test"}';
      expect(extractSayFromText(input)).toBe(input);
    });

    it('returns empty string if text is only JSON with empty say', () => {
      const input = '{"say": "", "play": []}';
      const result = extractSayFromText(input);
      expect(result).toBe('');
    });
  });

  describe('shouldFilterChunk', () => {
    it('returns false for normal text tokens', () => {
      expect(shouldFilterChunk('你好')).toBe(false);
      expect(shouldFilterChunk('这首歌')).toBe(false);
    });

    it('returns true when JSON opening detected', () => {
      expect(shouldFilterChunk('{')).toBe(true);
      expect(shouldFilterChunk('```json')).toBe(true);
    });
  });
});
