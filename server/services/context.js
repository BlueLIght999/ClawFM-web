/**
 * Context Window 鈥?6-slot prompt assembly
 * Blueprint Layer 3: 姣忔瑙﹀彂鎸夎繖 6 鐗囩矘鎴?prompt
 *
 * Slots:
 *   鈶?绯荤粺鎻愮ず璇?   prompts/dj-persona.md
 *   鈶?鐢ㄦ埛璇枡      user/*.md
 *   鈶?鐢ㄦ埛杈撳叆/宸ュ叿缁撴灉  /api/chat || ncm search results
 *   鈶?宸叉绱㈣蹇?   state.db 鈫?plays
 *   鈶?鐜娉ㄥ叆      weather 路 calendar 路 now
 *   鈶?鎵ц杞ㄨ抗      scheduler 路 webhook
 */

import { formatUserCorpus } from '../domain/curation/formatUserCorpus.js';
import { defaultCorpus } from '../infrastructure/storage/defaultCorpus.js';
import { legacyListenHistoryRepository } from '../infrastructure/persistence/repositories/LegacyListenHistoryRepository.js';
import { legacyListenerProfileRepository } from '../infrastructure/persistence/repositories/LegacyListenerProfileRepository.js';
import { legacySeedPoolRepository } from '../infrastructure/persistence/repositories/LegacySeedPoolRepository.js';

// --- Slot loaders ---

/**
 * Slot 鈶? User taste corpus.
 * @param {{readTaste,readRoutines,readMoodRules}} corpus injected CorpusPort
 */
export function slotUserCorpus(corpus = defaultCorpus) {
  return formatUserCorpus({
    taste: corpus.readTaste(),
    routines: corpus.readRoutines(),
    moodRules: corpus.readMoodRules(),
  });
}

/** Slot 鈶? User input and tool results */
function slotUserInput(input, toolResults) {
  const parts = [];
  if (input) parts.push(`### Recent Input\n${input}`);
  if (toolResults) parts.push(`### Tool Results\n${toolResults}`);
  return parts.join('\n\n');
}

/** Slot 鈶? Retrieved memory from state.db */
function defaultRepositories() {
  return {
    listenHistory: legacyListenHistoryRepository,
    profile: legacyListenerProfileRepository,
    seedPool: legacySeedPoolRepository,
  };
}

function slotMemory(repositories = defaultRepositories()) {
  const plays = repositories.listenHistory.history(20);
  const profile = repositories.profile.get();
  const seedPool = repositories.seedPool.all();

  if (plays.length === 0 && seedPool.length === 0) return '';

  const recentSongs = plays
    .slice(0, 10)
    .map(p => `- ${p.title} 鈥?${p.artist} (${new Date(p.playedAt ?? p.played_at).toLocaleTimeString()})`)
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

/** Slot 鈶? Environment injection */
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

/** Slot 鈶? Execution trace */
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
 * @param {string}  params.userInput     鈥?slot 鈶? user chat text
 * @param {string}  params.toolResults   鈥?slot 鈶? ncm search results etc.
 * @param {Object}  params.environment   鈥?slot 鈶? {weather, calendar}
 * @param {Object}  params.execTrace     鈥?slot 鈶? {lastAction, queueLength, mode}
 * @returns {string} assembled prompt
 */
export function assemblePrompt({
  userInput = '',
  toolResults = '',
  environment = {},
  execTrace = {},
  corpus = defaultCorpus,
  repositories = defaultRepositories(),
} = {}) {
  const slots = [
    { label: '鈶?system-persona',    content: '' }, // loaded separately
    { label: '鈶?user-corpus',       content: slotUserCorpus(corpus) },
    { label: '鈶?user-input+tools',  content: slotUserInput(userInput, toolResults) },
    { label: '鈶?memory',            content: slotMemory(repositories) },
    { label: '鈶?environment',       content: slotEnvironment(environment) },
    { label: '鈶?exec-trace',        content: slotExecutionTrace(execTrace) },
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

