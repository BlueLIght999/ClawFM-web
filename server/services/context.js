/**
 * Context Window — 6-slot prompt assembly
 * Blueprint Layer 3: 每次触发按这 6 片粘成 prompt
 *
 * Slots:
 *   ① 系统提示词    prompts/dj-persona.md
 *   ② 用户语料      user/*.md
 *   ③ 用户输入/工具结果  /api/chat || ncm search results
 *   ④ 已检索记忆    state.db → plays
 *   ⑤ 环境注入      weather · calendar · now
 *   ⑥ 执行轨迹      scheduler · webhook
 */

import { getListenHistory, getUserProfile, getSeedPool } from '../db/history.js';
import { formatUserCorpus } from '../domain/curation/formatUserCorpus.js';
import { defaultCorpus } from '../infrastructure/storage/defaultCorpus.js';

// --- Slot loaders ---

/**
 * Slot ②: User taste corpus.
 * @param {{readTaste,readRoutines,readMoodRules}} corpus injected CorpusPort
 */
export function slotUserCorpus(corpus = defaultCorpus) {
  return formatUserCorpus({
    taste: corpus.readTaste(),
    routines: corpus.readRoutines(),
    moodRules: corpus.readMoodRules(),
  });
}

/** Slot ③: User input and tool results */
function slotUserInput(input, toolResults) {
  const parts = [];
  if (input) parts.push(`### Recent Input\n${input}`);
  if (toolResults) parts.push(`### Tool Results\n${toolResults}`);
  return parts.join('\n\n');
}

/** Slot ④: Retrieved memory from state.db */
function slotMemory() {
  const plays = getListenHistory(20);
  const profile = getUserProfile();
  const seedPool = getSeedPool();

  if (plays.length === 0 && seedPool.length === 0) return '';

  const recentSongs = plays
    .slice(0, 10)
    .map(p => `- ${p.title} — ${p.artist} (${new Date(p.played_at).toLocaleTimeString()})`)
    .join('\n');

  const topArtists = (profile.topArtists || []).slice(0, 5)
    .map(a => `- ${a.name} (${a.count} plays)`)
    .join('\n');

  const seedInfo = seedPool.length > 0
    ? `Seed pool: ${seedPool.length} songs from user's playlists and liked songs.`
    : '';

  return [
    recentSongs ? `### Recently Played\n${recentSongs}` : '',
    topArtists ? `### Top Artists\n${topArtists}` : '',
    seedInfo ? `### Taste Database\n${seedInfo}` : '',
  ].filter(Boolean).join('\n\n');
}

/** Slot ⑤: Environment injection */
function slotEnvironment(env = {}) {
  const parts = [];
  const now = new Date();
  const hour = now.getHours();
  const dow = now.toLocaleDateString('en', { weekday: 'long' });

  let timeMood = 'night/chill';
  if (hour >= 6 && hour < 12) timeMood = 'morning/startup';
  else if (hour >= 12 && hour < 17) timeMood = 'afternoon/daytime';
  else if (hour >= 17 && hour < 22) timeMood = 'evening/warm';

  parts.push(`Now: ${now.toLocaleString()}, ${dow}, mood=${timeMood}`);
  if (env.weather) parts.push(`Weather: ${env.weather}`);
  if (env.calendar) parts.push(`Calendar: ${env.calendar}`);

  return parts.join('\n');
}

/** Slot ⑥: Execution trace */
function slotExecutionTrace(trace = {}) {
  const parts = [];
  if (trace.lastAction) parts.push(`Last action: ${trace.lastAction}`);
  if (trace.queueLength !== undefined) parts.push(`Queue: ${trace.queueLength} songs`);
  if (trace.mode) parts.push(`Mode: ${trace.mode}`);
  return parts.join('\n');
}

// --- Main assembler ---

/**
 * Assemble the full Context Window prompt from 6 slots.
 *
 * @param {Object} params
 * @param {string}  params.userInput     — slot ③: user chat text
 * @param {string}  params.toolResults   — slot ③: ncm search results etc.
 * @param {Object}  params.environment   — slot ⑤: {weather, calendar}
 * @param {Object}  params.execTrace     — slot ⑥: {lastAction, queueLength, mode}
 * @returns {string} assembled prompt
 */
export function assemblePrompt({
  userInput = '',
  toolResults = '',
  environment = {},
  execTrace = {},
} = {}) {
  const slots = [
    { label: '① system-persona',    content: '' }, // loaded separately
    { label: '② user-corpus',       content: slotUserCorpus() },
    { label: '③ user-input+tools',  content: slotUserInput(userInput, toolResults) },
    { label: '④ memory',            content: slotMemory() },
    { label: '⑤ environment',       content: slotEnvironment(environment) },
    { label: '⑥ exec-trace',        content: slotExecutionTrace(execTrace) },
  ];

  const fragments = slots
    .filter(s => s.content)
    .map(s => `<!-- ${s.label} -->\n${s.content}`);

  return fragments.join('\n\n---\n\n');
}

/**
 * Get the time-of-day mood category (used by scheduler + recommender)
 */
export function getTimeOfDayMood() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}
