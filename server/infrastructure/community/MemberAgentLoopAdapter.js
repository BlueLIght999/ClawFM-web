/**
 * MemberAgentLoopAdapter — 成员 agent 循环适配器（infrastructure）。
 *
 * 实现 MemberAgentLoopPort.generateComment：用注入的 generate(messages) 调 LLM 生成评论。
 * generate 由 bootstrap 注入（接 llmClient / DeepSeek），未配置时抛错由 MemberAgentService 降级。
 */
const COMMENT_PROMPT = `用主人的品味口吻简短评论这条社区帖子（不超过 60 字，自然口语，不冒充真人，末尾署名「——来自主人的 agent」）：`;

const DM_REPLY_PROMPT = `以下是你与「@访客」的私信对话片段。请以主人的身份与品味，自然口语地回复对方（不超过 80 字，不冒充真人，署名「——来自主人的 agent」）。仅输出你的回复正文。`;

export function createMemberAgentLoopAdapter({ generate, logger } = {}) {
  return {
    async generateComment(persona, postContent) {
      const text = await generate([
        { role: 'system', content: persona || '你是一个社区成员的个人 agent' },
        { role: 'user', content: `${COMMENT_PROMPT}\n${postContent || ''}` },
      ]);
      return String(text || '').trim();
    },

    async generateReply(persona, dmContext) {
      const text = await generate([
        { role: 'system', content: persona || '你是一个社区成员的个人 agent' },
        { role: 'user', content: `${DM_REPLY_PROMPT}\n\n${dmContext || ''}` },
      ]);
      return String(text || '').trim();
    },
  };
}
