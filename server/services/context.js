/**
 * Context Window — 6-slot prompt assembly (thin infrastructure adapter).
 *
 * Domain logic extracted to domain/hosting/contextSlots.js.
 * This file now only wires injected dependencies to domain functions.
 *
 * Slots:
 *   ① 系统提示词     prompts/dj-persona.md (loaded separately)
 *   ② 用户语料       user/*.md (via injected CorpusPort)
 *   ③ 用户输入/工具结果  /api/chat || ncm search results
 *   ④ 已检索记忆     state.db → plays
 *   ⑤ 环境注入       weather · calendar · now
 *   ⑥ 执行轨迹       scheduler · webhook
 */

import { formatUserCorpus } from '../domain/curation/formatUserCorpus.js';
import { getTimeOfDayMood } from '../domain/hosting/getTimeOfDayMood.js';
import { assembleContextPrompt } from '../domain/hosting/contextSlots.js';

/**
 * Slot ② User taste corpus.
 * @param {{readTaste,readRoutines,readMoodRules}} corpus injected CorpusPort
 */
export function slotUserCorpus(corpus = null) {
  if (!corpus) return '';
  return formatUserCorpus({
    taste: corpus.readTaste(),
    routines: corpus.readRoutines(),
    moodRules: corpus.readMoodRules(),
  });
}

/**
 * Assemble the full Context Window prompt from 6 slots.
 * Delegates to domain assembleContextPrompt, injecting slotUserCorpus as slot ②.
 */
export function assemblePrompt({
  userInput = '',
  toolResults = '',
  environment = {},
  execTrace = {},
  corpus = null,
  repositories = null,
} = {}) {
  return assembleContextPrompt({
    userInput,
    toolResults,
    environment,
    execTrace,
    corpus,
    repositories,
    slotUserCorpusFn: slotUserCorpus,
  });
}

/**
 * Get the time-of-day mood category (used by scheduler + recommender)
 * Re-exported from domain for backward compatibility.
 */
export { getTimeOfDayMood };
