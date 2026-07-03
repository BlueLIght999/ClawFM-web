/**
 * Pure derivation of the three conditional context lines for the proactive
 * prompt. Extracted from buildProactivePrompt to move the ternary branches
 * out, lowering that builder's complexity.
 *
 * @param {object} ctx proactive decision context
 * @returns {{weatherMark:string, chatLine:string, hourLine:string}}
 */
export function proactiveContextLines(ctx = {}) {
  return {
    weatherMark: ctx.weatherChanged ? '(刚变化) ' : '',
    chatLine: ctx.lastChatMessage
      ? `最近听众聊天: "${ctx.lastChatMessage}"`
      : '最近无听众互动',
    hourLine: ctx.hourChanged ? '(刚刚进入新的小时段)' : '',
  };
}
