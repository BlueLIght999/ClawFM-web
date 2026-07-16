/**
 * Build messages for the merged intent + chat LLM call.
 *
 * The LLM is instructed to output:
 * 1. JSON intent on the first line
 * 2. `|||` separator
 * 3. DJ reply text (streamed)
 *
 * This replaces the separate extractIntent + chatWithDj calls.
 */

const MERGED_SYSTEM_PROMPT = `你是 Qclaudio 88.7 电台的 AI DJ。你需要同时完成两个任务：

1. 意图识别：分析用户消息，输出 JSON 意图。
2. DJ 回复：用中文自然地回复用户。

输出格式（严格遵守）：
- 第 1 行：JSON 意图对象，格式为 {"action":"...","params":{...}}
- 第 2 行：|||（分隔符）
- 第 3 行起：你的 DJ 回复（纯文本，不要 JSON 包裹）

可用的 action 值：
- "play_mood"：用户想要某种氛围/心情的音乐。params: {"mood":"happy|sad|chill|energetic|focus|romantic|nostalgic"}
- "play_artist"：用户想听某位歌手的歌。params: {"artist":"歌手名","song":""}
- "play_song"：用户想听某首歌。params: {"song":"歌名"}
- "play_personalized"：用户想要个性化推荐。params: {"preference":""}
- "reject_recommend"：用户不喜欢当前推荐。params: {}
- "chat"：日常对话，非音乐请求。params: {}

规则：
- 如果用户只是在聊天、问候、问问题，action 设为 "chat"。
- 你的 DJ 回复应该简短自然，像真实电台主持，最多 2-3 个短句。
- 如果是音乐请求，简短地确认你理解了用户的需求即可，不要列出歌曲名。
- 所有输出必须使用中文。`;

/**
 * Build messages for the merged intent+chat LLM call.
 *
 * @param {string} persona - DJ persona text
 * @param {string} userMessage - User's input text
 * @param {Array<{role:string,content:string}>} history - Recent chat history
 * @param {Array<{name:string}>} topArtists - User's top artists for context
 * @param {string|null} contextPrompt - Additional context (weather, time, etc.)
 * @returns {Array<{role:string,content:string}>}
 */
export function buildMergedIntentMessages(persona, userMessage, history = [], topArtists = [], contextPrompt = null) {
  const messages = [
    { role: 'system', content: persona },
    { role: 'system', content: MERGED_SYSTEM_PROMPT },
  ];

  if (contextPrompt) {
    messages.push({ role: 'system', content: contextPrompt });
  }

  const artistNames = (topArtists || []).slice(0, 5).map(a => a.name).join(', ');
  if (artistNames) {
    messages.push({ role: 'system', content: `[听众画像：最常听的歌手包括 ${artistNames}]` });
  }

  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }

  messages.push({ role: 'user', content: userMessage });
  return messages;
}
