/**
 * Context Window slot functions — pure domain logic.
 *
 * Each slot function takes injected data and returns a string fragment.
 * No file I/O, no direct repository imports — all data passed as params.
 *
 * Slots:
 *   ② user-corpus       (handled by slotUserCorpus in context.js, uses formatUserCorpus)
 *   ③ user-input+tools  slotUserInput
 *   ④ memory            slotMemory
 *   ⑤ environment       slotEnvironment
 *   ⑥ exec-trace        slotExecutionTrace
 */

import { getTimeOfDayMood } from './getTimeOfDayMood.js';
import { playedAt } from '../shared/songId.js';

const MOOD_LABELS = {
  morning: 'morning/startup',
  afternoon: 'afternoon/daytime',
  evening: 'evening/warm',
  night: 'night/chill',
};

/** Slot ③ User input and tool results */
export function slotUserInput(input, toolResults) {
  const parts = [];
  if (input) parts.push(`### Recent Input\n${input}`);
  if (toolResults) parts.push(`### Tool Results\n${toolResults}`);
  return parts.join('\n\n');
}

/**
 * Slot ④ Retrieved memory from state.db.
 *
 * `repositories` is annotated rather than left to inference: the `= null` default
 * makes tsc type the parameter as literally `null`, which collapses every field
 * read after the guard to `never`.
 *
 * @param {{listenHistory?: {history: (n: number) => Array<any>}, profile?: {get: () => any}, seedPool?: {all: () => Array<any>}}|null} [repositories]
 * @returns {string}
 */
export function slotMemory(repositories = null) {
  if (!repositories || !repositories.listenHistory) return '';
  const plays = repositories.listenHistory.history(20);
  const profile = repositories.profile ? repositories.profile.get() : {};
  const seedPool = repositories.seedPool ? repositories.seedPool.all() : [];

  if (plays.length === 0 && seedPool.length === 0) return '';

  const recentSongs = plays
    .slice(0, 10)
    .map(p => {
      // playedAt() is optional by contract; an unguarded new Date(undefined)
      // renders the literal string "Invalid Date" into the prompt.
      const ts = playedAt(p);
      const stamp = ts ? new Date(ts).toLocaleTimeString() : 'unknown';
      return `- ${p.title} — ${p.artist} (${stamp})`;
    })
    .join('\n');

  const topArtists = (profile.topArtists || []).slice(0, 5)
    .map(a => `- ${a.name} (${a.count} plays)`)
    .join('\n');

  const seedSongs = seedPool.slice(0, 10)
    .map(s => `- ${s.title || s.songId || s.id || 'unknown'} — ${s.artist || 'unknown'}`)
    .join('\n');

  const seedInfo = seedPool.length > 0
    ? `Seed pool: ${seedPool.length} songs from user's playlists and liked songs.\n${seedSongs}`
    : '';

  return [
    recentSongs ? `### Recently Played\n${recentSongs}` : '',
    topArtists ? `### Top Artists\n${topArtists}` : '',
    seedInfo ? `### Taste Database\n${seedInfo}` : '',
  ].filter(Boolean).join('\n\n');
}

/** Slot ⑤ Environment injection */
export function slotEnvironment(env = {}, now = new Date()) {
  const parts = [];
  const dow = now.toLocaleDateString('en', { weekday: 'long' });
  const mood = getTimeOfDayMood(now);
  const timeMood = MOOD_LABELS[mood] || 'night/chill';

  parts.push(`Now: ${now.toLocaleString()}, ${dow}, mood=${timeMood}`);
  if (env.weather) parts.push(`Weather: ${env.weather}`);
  if (env.calendar) parts.push(`Calendar: ${env.calendar}`);

  return parts.join('\n');
}

/** Slot ⑥ Execution trace */
export function slotExecutionTrace(trace = {}) {
  const parts = [];
  if (trace.lastAction) parts.push(`Last action: ${trace.lastAction}`);
  if (trace.queueLength !== undefined) parts.push(`Queue: ${trace.queueLength} songs`);
  if (trace.mode) parts.push(`Mode: ${trace.mode}`);
  return parts.join('\n');
}

/**
 * Assemble the full Context Window prompt from 6 slots.
 *
 * Params are destructured directly -- there is no `params` wrapper object, so the
 * tags must be named after the destructured bindings themselves.
 *
 * @param {{userInput?: string, toolResults?: string, environment?: object, execTrace?: object, corpus?: object|null, repositories?: object|null, slotUserCorpusFn?: ((corpus: any) => string)|null}} [params]
 * @returns {string} assembled prompt
 */
export function assembleContextPrompt({
  userInput = '',
  toolResults = '',
  environment = {},
  execTrace = {},
  corpus = null,
  repositories = null,
  slotUserCorpusFn = null,
} = {}) {
  const slots = [
    { label: '① system-persona',    content: '' }, // loaded separately
    { label: '② user-corpus',       content: slotUserCorpusFn ? slotUserCorpusFn(corpus) : '' },
    { label: '③ user-input+tools',  content: slotUserInput(userInput, toolResults) },
    { label: '④ memory',            content: slotMemory(repositories) },
    { label: '⑤ environment',       content: slotEnvironment(environment) },
    { label: '⑥ exec-trace',        content: slotExecutionTrace(execTrace) },
  ];

  const fragments = slots
    .filter(s => s.content)
    .map(s => `<!-- ${s.label} -->\n${s.content}`);

  return fragments.join('\n\n---\n\n');
}
