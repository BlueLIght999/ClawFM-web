/**
 * AI Playlist Planner — generates themed listening plans using DeepSeek LLM.
 * Falls back to time-of-day templates when LLM is unavailable.
 * D8-compliant: dependencies injected via configurePlanner() from bootstrap.js.
 */

import { assemblePrompt, getTimeOfDayMood } from './context.js';

// --- Injected dependencies (set by bootstrap.js via configurePlanner) ---
let _deps = {
  llm: null,          // DeepSeekLlmAdapter (LlmPort)
  weather: null,      // WeatherPort
  planRepository: null, // PlanRepository
};

/**
 * Inject dependencies from bootstrap.js (D8 compliance).
 * @param {{llm, weather, planRepository}} deps
 */
export function configurePlanner(deps) {
  _deps = { ..._deps, ...deps };
}

// In-memory cache
let _cache = null;
let _pendingPromise = null;

const FALLBACK_PLANS = {
  morning: [
    { theme: '晨光微醒', genreHints: ['pop', 'acoustic'], targetCount: 6, rationale: '温柔的吉他与人声，轻轻把你从睡梦中唤醒' },
    { theme: '城市节拍', genreHints: ['indie pop', 'folk'], targetCount: 7, rationale: '有节奏但不过分喧闹，适合通勤路上的耳朵' },
    { theme: '元气充能', genreHints: ['rock', 'alternative'], targetCount: 5, rationale: '加入一点能量，为上午的工作蓄力' },
  ],
  afternoon: [
    { theme: '午后频率', genreHints: ['instrumental', 'ambient'], targetCount: 7, rationale: '用没有歌词的旋律填充午后的空白' },
    { theme: '专注声场', genreHints: ['post-rock', 'electronic'], targetCount: 8, rationale: '有层次但不打扰，适合进入心流状态' },
    { theme: '微澜', genreHints: ['jazz', 'bossa nova'], targetCount: 5, rationale: '一丝优雅的律动，提神不喧宾夺主' },
  ],
  evening: [
    { theme: '落日余晖', genreHints: ['indie pop', 'acoustic'], targetCount: 6, rationale: '用轻快的旋律收尾白天，呼应傍晚的柔和光线' },
    { theme: '霓虹初上', genreHints: ['synthwave', 'electronic', 'city pop'], targetCount: 8, rationale: '电子节拍为你点亮夜晚的第一盏灯' },
    { theme: '温暖声线', genreHints: ['R&B', 'soul', 'jazz'], targetCount: 6, rationale: '深情的嗓音和温暖的旋律，陪伴晚餐时光' },
  ],
  night: [
    { theme: '深夜电台', genreHints: ['ambient', 'lo-fi'], targetCount: 7, rationale: '降低BPM，让思绪漂浮在安静的频率中' },
    { theme: '梦境入口', genreHints: ['dream pop', 'shoegaze'], targetCount: 6, rationale: '迷幻的音墙是通往梦境的最佳通道' },
    { theme: '枕边细语', genreHints: ['acoustic', 'folk', 'piano'], targetCount: 5, rationale: '最温柔的声音，陪你说完今天最后一句话' },
  ],
};

function buildFallbackPlan(weather, mood) {
  const blocks = FALLBACK_PLANS[mood] || FALLBACK_PLANS.evening;
  const now = new Date();
  const planId = `${now.toISOString().split('T')[0]}-${mood}-fallback`;

  const moodLabels = { morning: '早晨', afternoon: '午后', evening: '傍晚', night: '深夜' };
  return {
    planId,
    generatedAt: now.toISOString(),
    mood,
    weather: weather || '',
    rationale: `${moodLabels[mood] || ''}时段的播放计划，根据时间段和聆听习惯自动编排。`,
    blocks,
  };
}

async function callPlanner(messages) {
  if (!_deps.llm) return null;
  return _deps.llm.complete(messages, {
    maxTokens: 800,
    temperature: 0.7,
    jsonMode: true,
  });
}

function validatePlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.blocks) || raw.blocks.length === 0) return null;

  const blocks = raw.blocks.slice(0, 5).map((b, i) => ({
    theme: b.theme || `Block ${i + 1}`,
    genreHints: Array.isArray(b.genreHints) ? b.genreHints.slice(0, 4) : ['pop'],
    targetCount: Math.min(12, Math.max(3, parseInt(b.targetCount) || 6)),
    rationale: b.rationale || '',
  }));

  return {
    planId: raw.planId || `${new Date().toISOString().split('T')[0]}-${raw.mood || 'unknown'}-v1`,
    generatedAt: new Date().toISOString(),
    mood: raw.mood || getTimeOfDayMood(),
    weather: raw.weather || '',
    rationale: raw.rationale || '',
    blocks,
  };
}

async function _doGenerate() {
  const weather = _deps.weather ? await _deps.weather.current() : '';
  const mood = getTimeOfDayMood();

  // Try LLM
  const contextPrompt = assemblePrompt({ environment: { weather } });
  const planningInstruction = `You are the music director of Qclaudio 88.7, a retro-styled 24/7 online radio station.

## Task
Design a listening plan with 3-5 themed "blocks" for the next 2-3 hours. Each block is a segment of songs that flow together.

## Context
${contextPrompt}

## Output (STRICT JSON ONLY)
{
  "planId": "${new Date().toISOString().split('T')[0]}-${mood}-v1",
  "mood": "${mood}",
  "weather": "${weather}",
  "rationale": "1-2 sentence overall plan rationale in Chinese, warm DJ tone",
  "blocks": [
    {
      "theme": "3-6 word Chinese theme name",
      "genreHints": ["genre1", "genre2"],
      "targetCount": 6,
      "rationale": "1 sentence why these songs fit this moment, in Chinese"
    }
  ]
}

## Rules
- Exactly 3-5 blocks. Total songs: 20-30.
- Genre hints in ENGLISH (for search API). Themes/rationales in CHINESE.
- Follow the time-of-day mood: morning=energetic gentle, afternoon=focused neutral, evening=warm engaged, night=intimate chill.
- Weather matters: rain→cozy, sunshine→upbeat, snow→warm, night→calm.
- Balance familiar favorites with discovery. Reference the listener's taste when available.`;

  const messages = [
    { role: 'system', content: 'You are the music director of Qclaudio 88.7. Output valid JSON only.' },
    { role: 'user', content: planningInstruction },
  ];

  let plan = null;
  const raw = await callPlanner(messages);
  if (raw) {
    try {
      plan = validatePlan(JSON.parse(raw));
    } catch (e) {
      console.error('[Planner] JSON parse failed:', e.message);
    }
  }

  // Fallback
  if (!plan) {
    console.log('[Planner] Using fallback plan for mood:', mood);
    plan = buildFallbackPlan(weather, mood);
  }

  // Cache
  _cache = { plan, mood, generatedAt: Date.now() };
  if (_deps.planRepository) {
    try {
      _deps.planRepository.save(plan, mood);
    } catch (e) {
      console.warn('[Planner] Plan cache save failed:', e.message);
    }
  }

  console.log('[Planner] Plan generated:', plan.planId, `(${plan.blocks.length} blocks)`);
  return plan;
}

export async function generatePlan(force = false) {
  if (!force && _cache && !isPlanStale()) return _cache.plan;
  if (_pendingPromise) return _pendingPromise;

  _pendingPromise = _doGenerate();
  try {
    return await _pendingPromise;
  } finally {
    _pendingPromise = null;
  }
}

export function getPlan() {
  if (_cache && !isPlanStale()) return _cache;
  // Try DB
  if (_deps.planRepository) {
    const dbPlan = _deps.planRepository.latest();
    if (dbPlan && dbPlan.plan) {
      _cache = { plan: dbPlan.plan, mood: dbPlan.mood, generatedAt: new Date(dbPlan.generatedAt).getTime() };
      if (!isPlanStale()) return _cache;
    }
  }
  return null;
}

export function isPlanStale() {
  if (!_cache) return true;
  const currentMood = getTimeOfDayMood();
  if (_cache.mood !== currentMood) return true;
  if (Date.now() - _cache.generatedAt > 60 * 60 * 1000) return true;
  return false;
}

export async function regeneratePlan() {
  return generatePlan(true);
}
