import { createToolDefinition } from '../../domain/toolDefinition.js';

/**
 * Factory that creates and registers all agent tools onto a ToolRegistry.
 *
 * Each tool wraps an existing service method into a standardized
 * ToolDefinition with name, description, JSON Schema parameters,
 * and an async execute function.
 *
 * The factory receives a registry (injected) and service dependencies.
 * It does NOT import infrastructure — all deps are passed in.
 *
 * @param {object} deps
 * @param {object} deps.registry - ToolRegistryPort implementation
 * @param {object} deps.scheduler - Playback scheduler
 * @param {object} deps.queue - Song queue
 * @param {object} deps.recommender - Recommendation service
 * @param {object} deps.music - Music source adapter
 * @param {object} deps.planner - Plan generator
 * @returns {object} The registry with all tools registered
 */
// eslint-disable-next-line max-lines-per-function
export function createToolFactory({ registry, scheduler, queue, recommender, music, planner }) {
  // ── Playback control tools ──

  registry.register(createToolDefinition({
    name: 'skip',
    description: '跳过当前正在播放的歌曲，播放下一首',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      await scheduler.skip();
      return { handled: true, state: scheduler.getState() };
    },
  }));

  registry.register(createToolDefinition({
    name: 'pause',
    description: '暂停播放',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      scheduler.pause();
      return { handled: true, paused: true };
    },
  }));

  registry.register(createToolDefinition({
    name: 'resume',
    description: '恢复播放',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      scheduler.resume();
      return { handled: true, resume: { startedAt: scheduler.playhead?.startedAt } };
    },
  }));

  registry.register(createToolDefinition({
    name: 'get_now_playing',
    description: '获取当前播放状态和正在播放的歌曲信息',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      return { handled: true, state: scheduler.getState() };
    },
  }));

  // ── Music search tool ──

  registry.register(createToolDefinition({
    name: 'search_music',
    description: '搜索音乐。可以将搜索结果加入播放队列。支持歌手名、歌曲名或关键词搜索。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词（歌手名、歌曲名等）',
        },
        limit: {
          type: 'number',
          description: '搜索结果数量上限，默认5',
        },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const { query, limit = 5 } = args;
      if (!query) return { handled: false, error: 'query is required' };

      try {
        const songs = await music.search(query, limit);
        const filtered = filterLiveVersions(songs);
        const results = filtered.slice(0, limit);

        for (let i = results.length - 1; i >= 0; i--) {
          queue.insertNext(results[i]);
        }

        return {
          handled: true,
          results,
          addedCount: results.length,
          queueUpdate: {
            upcomingSongs: queue.upcomingSongs,
            mode: queue.mode,
          },
        };
      } catch (err) {
        return { handled: false, error: err.message };
      }
    },
  }));

  // ── Recommendation tool ──

  registry.register(createToolDefinition({
    name: 'recommend',
    description: '根据听众口味推荐音乐并加入播放队列',
    parameters: {
      type: 'object',
      properties: {
        preference: {
          type: 'string',
          description: '可选的偏好描述（如"轻音乐"、"节奏感强"等）',
        },
      },
    },
    execute: async (args) => {
      const { preference } = args;
      try {
        let added;
        if (preference) {
          added = await recommender.fillQueueByPreference(preference, 10);
        } else {
          added = await recommender.fillQueue(10);
        }
        return {
          handled: true,
          addedCount: added.length,
          queueUpdate: {
            upcomingSongs: queue.upcomingSongs,
            mode: queue.mode,
          },
        };
      } catch (err) {
        return { handled: false, error: err.message };
      }
    },
  }));

  // ── Plan management tools ──

  registry.register(createToolDefinition({
    name: 'refresh_plan',
    description: '生成全新的收听计划，更换风格',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      try {
        const newPlan = await planner.generatePlan(true);
        recommender.setPlanBlocks(newPlan.blocks);
        await recommender.fillQueue(15, newPlan.blocks);
        return {
          handled: true,
          planUpdate: newPlan,
          queueUpdate: {
            upcomingSongs: queue.upcomingSongs,
            mode: queue.mode,
          },
        };
      } catch (err) {
        return { handled: false, error: err.message };
      }
    },
  }));

  registry.register(createToolDefinition({
    name: 'select_plan_block',
    description: '选择收听计划中的特定区块（从0开始计数）',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'number',
          description: '区块索引（从0开始）',
        },
      },
      required: ['index'],
    },
    execute: async (args) => {
      const { index } = args;
      const cachedPlan = planner.getPlan();
      const blocks = cachedPlan?.plan?.blocks || [];
      if (blocks.length === 0) {
        return { handled: false, error: 'no plan available' };
      }
      recommender._planProgress.autoMode = false;
      recommender._planProgress.currentBlockIndex = index;
      recommender._planProgress.songsFilledInBlock = 0;
      await recommender.fillQueue(12, blocks);
      return {
        handled: true,
        blockIndex: index,
        queueUpdate: {
          upcomingSongs: queue.upcomingSongs,
          mode: queue.mode,
        },
      };
    },
  }));

  registry.register(createToolDefinition({
    name: 'pin_plan_block',
    description: '固定当前收听计划区块，停止自动切换',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const cachedPlan = planner.getPlan();
      const blocks = cachedPlan?.plan?.blocks || [];
      if (blocks.length === 0) {
        return { handled: false, error: 'no plan available' };
      }
      const activeIdx = recommender._planProgress.currentBlockIndex;
      recommender._planProgress.pinned = true;
      recommender._planProgress.autoMode = false;
      await recommender.fillQueue(12, blocks);
      return {
        handled: true,
        pinnedIndex: activeIdx,
        queueUpdate: {
          upcomingSongs: queue.upcomingSongs,
          mode: queue.mode,
        },
      };
    },
  }));

  registry.register(createToolDefinition({
    name: 'clear_plan',
    description: '清除计划固定，恢复自动模式',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      recommender._planProgress.autoMode = true;
      recommender._planProgress.pinned = false;
      const cachedPlan = planner.getPlan();
      const blocks = cachedPlan?.plan?.blocks || [];
      await recommender.fillQueue(12, blocks);
      return {
        handled: true,
        queueUpdate: {
          upcomingSongs: queue.upcomingSongs,
          mode: queue.mode,
        },
      };
    },
  }));

  // ── Queue status tool ──

  registry.register(createToolDefinition({
    name: 'get_queue_status',
    description: '获取当前播放队列的状态信息',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      return {
        handled: true,
        length: queue.future?.length || 0,
        mode: queue.mode,
        upcomingSongs: queue.upcomingSongs,
      };
    },
  }));

  return registry;
}

// ── Private helpers ──

const LIVE_PATTERNS = [
  /live/i, /现场/, /演唱会/, /音乐会/, /音乐节/, /巡演/, /公演/,
  /\(\s*live\s*\)/i, /\[\s*live\s*\]/i, /acoustic/i, /unplugged/i,
  /remix/i, /混音/, /伴奏/, /instrumental/i, /demo/i,
];

function isLiveVersion(song) {
  const title = song.name || song.title || '';
  for (const p of LIVE_PATTERNS) {
    if (p.test(title)) return true;
  }
  return false;
}

function filterLiveVersions(songs) {
  return songs.filter(s => !isLiveVersion(s));
}
