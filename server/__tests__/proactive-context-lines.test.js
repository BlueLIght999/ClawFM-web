import { describe, it, expect } from 'vitest';
import { proactiveContextLines } from '../domain/hosting/proactiveContextLines.js';

/**
 * 特征测试 —— 提炼 buildProactivePrompt 里的三个条件派生行，
 * 把三元分支移出主函数，降 buildProactivePrompt 复杂度(12→≤10)。
 *
 * 现有行为(buildProactivePrompt):
 *   weatherMark: weatherChanged ? '(刚变化) ' : ''
 *   chatLine:    lastChatMessage ? `最近听众聊天: "${msg}"` : '最近无听众互动'
 *   hourLine:    hourChanged ? '(刚刚进入新的小时段)' : ''
 */
describe('proactiveContextLines', () => {
  it('weatherChanged_marksChange', () => {
    expect(proactiveContextLines({ weatherChanged: true }).weatherMark).toBe('(刚变化) ');
  });

  it('weatherNotChanged_emptyMark', () => {
    expect(proactiveContextLines({}).weatherMark).toBe('');
  });

  it('withChatMessage_formatsChatLine', () => {
    expect(proactiveContextLines({ lastChatMessage: '你好' }).chatLine).toBe('最近听众聊天: "你好"');
  });

  it('noChatMessage_showsNoInteraction', () => {
    expect(proactiveContextLines({}).chatLine).toBe('最近无听众互动');
  });

  it('hourChanged_marksHour', () => {
    expect(proactiveContextLines({ hourChanged: true }).hourLine).toBe('(刚刚进入新的小时段)');
  });

  it('hourNotChanged_emptyHourLine', () => {
    expect(proactiveContextLines({}).hourLine).toBe('');
  });
});
