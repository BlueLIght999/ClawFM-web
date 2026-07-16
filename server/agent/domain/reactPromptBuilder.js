/**
 * ReAct system prompt builder.
 *
 * Constructs the system prompt for the ReAct agent loop.
 * The prompt sets the DJ persona, provides environmental context,
 * and instructs the LLM on tool usage behavior.
 */

/**
 * Build the ReAct system prompt.
 *
 * @param {string} persona - DJ persona text (loaded from dj-persona.md)
 * @param {string} contextPrompt - Assembled context (weather, queue, etc.)
 * @returns {string} Complete system prompt
 */
export function buildReactSystemPrompt(persona, contextPrompt) {
  return `${persona}

你是 Qclaudio 88.7 电台的 DJ 助手。你可以使用工具来控制音乐播放、搜索歌曲和管理播放计划。

当前环境信息：
${contextPrompt}

工具使用指南：
1. 当用户想要控制播放（跳过、暂停、恢复）时，使用相应的工具。
2. 当用户想听特定歌手或歌曲时，先使用 search_music 搜索，工具会自动将结果加入队列。
3. 当用户想听推荐音乐时，使用 recommend 工具。
4. 当用户只是聊天、问候或表达感受时，直接回复，不需要使用工具。
5. 回复要简洁自然，像真实的电台 DJ 一样，不要列出一长串歌曲清单。
6. 如果一次工具调用就满足了用户需求，不需要继续调用更多工具。

重要：当你决定使用工具时，必须同时在 content 中给出简短的中文回复（如"好的，帮你跳过！"）。不要只返回工具调用而不返回文字内容。这样用户不需要等待额外的延迟。`;
}

/**
 * Build the initial user message for the ReAct loop.
 *
 * @param {string} userText - Raw user input
 * @returns {{role: string, content: string}}
 */
export function buildUserMessage(userText) {
  return { role: 'user', content: userText };
}

/**
 * Build the complete messages array for the first LLM call.
 *
 * @param {string} persona - DJ persona
 * @param {string} contextPrompt - Environmental context
 * @param {string} userText - User's message
 * @param {Array} history - Previous conversation history (optional)
 * @returns {Array} Messages array ready for function calling API
 */
export function buildReactMessages(persona, contextPrompt, userText, history = []) {
  const messages = [
    { role: 'system', content: buildReactSystemPrompt(persona, contextPrompt) },
  ];
  for (const msg of history) {
    messages.push(msg);
  }
  messages.push(buildUserMessage(userText));
  return messages;
}
