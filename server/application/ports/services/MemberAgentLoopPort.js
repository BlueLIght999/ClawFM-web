/**
 * MemberAgentLoopPort — 成员 agent 循环 Port（F8）。
 * 实现见 infrastructure/MemberAgentLoopAdapter.js（P1-5，复用 AgentTurnService，注入成员 persona）。
 * application 层只调 generateComment，不接触 LLM/agent 循环细节（守 D3/D4）。
 *
 * @typedef {object} MemberAgentLoopPort
 * @property {(persona: string, postContent: string) => Promise<string>} generateComment
 * @property {(persona: string, dmContext: string) => Promise<string>} generateReply — 🆕 agent 私信回复
 */

export {};
