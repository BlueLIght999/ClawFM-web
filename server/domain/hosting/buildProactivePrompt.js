import { artistName } from './artistName.js';
import { firstTruthy } from '../curation/firstTruthy.js';

/**
 * Pure builder for the proactive-speech decision prompt.
 * Extracted from claude.js decideProactiveSpeech to move the many ||-fallback
 * chains and conditional concatenation out, lowering that function's complexity.
 * No IO — pure string construction.
 *
 * @param {object} ctx proactive decision context
 * @returns {string} the LLM prompt
 */
export function buildProactivePrompt(ctx = {}) {
  const songTitle = firstTruthy(ctx.currentSong?.name, ctx.currentSong?.title, '?');
  const songArtist = artistName(ctx.currentSong);
  const blockTheme = firstTruthy(ctx.activeBlock?.theme, 'auto');
  const blockHints = firstTruthy((ctx.activeBlock?.genreHints || []).join(', '), 'varied');
  const nextTitle = ctx.nextSong ? firstTruthy(ctx.nextSong.name, ctx.nextSong.title, '?') : '?';
  const secondTitle = ctx.secondNext ? firstTruthy(ctx.secondNext.name, ctx.secondNext.title, '?') : '?';
  const weatherMark = ctx.weatherChanged ? '(刚变化) ' : '';
  const chatLine = ctx.lastChatMessage
    ? `最近听众聊天: "${ctx.lastChatMessage}"`
    : '最近无听众互动';
  const hourLine = ctx.hourChanged ? '(刚刚进入新的小时段)' : '';

  return `你是 Qclaudio 88.7 的 AI DJ CLAWED（一只螃蟹）。

当前歌曲: "${songTitle}" by ${songArtist}
时间: ${ctx.timeOfDay}, 天气: ${weatherMark}${firstTruthy(ctx.weather, 'unknown')}
当前计划板块: "${blockTheme}" (${blockHints})
下首: ${nextTitle}, 再下一首: ${secondTitle}
距上次发言: ${ctx.secondsSinceLastSpeech}s, ${ctx.songsSinceLastSpeech} 首歌前
${chatLine}
${hourLine}

现在适合主动说话吗？只有以下情况才适合说话：
- 天气刚刚变化了，可以随口提一句
- 刚进入新的小时段，时间节点值得 mark
- 听众刚聊完天，可以接话/问候
- 已经很久没说话了（超过 3 首歌），可以活跃一下气氛
- 板块风格有明显变化

如果没什么特别的可说，就不要说话。宁缺毋滥。

输出 JSON (不要 markdown 代码块):
{"shouldSpeak": true/false, "message": "说的话（1-3句中文，DJ 口吻，纯文本，不要加动作标签）", "reason": "简短原因"}`;
}
