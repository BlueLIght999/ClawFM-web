import { describe, it, expect, vi } from 'vitest';
import { createToolFactory } from '../agent/application/services/ToolFactory.js';
import { createInMemoryToolRegistry } from '../agent/infrastructure/InMemoryToolRegistry.js';

function createDeps(overrides = {}) {
  const scheduler = {
    skip: vi.fn(async () => {}),
    pause: vi.fn(),
    resume: vi.fn(),
    getState: vi.fn(() => ({ playbackState: 'playing', current: { title: 'Test Song' } })),
    playhead: { startedAt: 12345 },
    ...overrides.scheduler,
  };
  const queue = {
    future: [],
    mode: 'sequential',
    upcomingSongs: [],
    insertNext: vi.fn(),
    ...overrides.queue,
  };
  const recommender = {
    fillQueue: vi.fn(async () => []),
    fillQueueByPreference: vi.fn(async () => []),
    setPlanBlocks: vi.fn(),
    _planProgress: { autoMode: true, currentBlockIndex: 0, songsFilledInBlock: 0, pinned: false },
    ...overrides.recommender,
  };
  const music = {
    search: vi.fn(async () => []),
    ...overrides.music,
  };
  const planner = {
    generatePlan: vi.fn(async () => ({ blocks: [] })),
    getPlan: vi.fn(() => null),
    ...overrides.planner,
  };
  return { scheduler, queue, recommender, music, planner };
}

describe('ToolFactory', () => {
  it('createsRegistryWithAllTools', () => {
    const deps = createDeps();
    const registry = createInMemoryToolRegistry();
    createToolFactory({ registry, ...deps });
    const tools = registry.list();
    const names = tools.map(t => t.name);
    expect(names).toContain('skip');
    expect(names).toContain('pause');
    expect(names).toContain('resume');
    expect(names).toContain('get_now_playing');
    expect(names).toContain('search_music');
    expect(names).toContain('recommend');
    expect(names).toContain('refresh_plan');
    expect(names).toContain('select_plan_block');
    expect(names).toContain('pin_plan_block');
    expect(names).toContain('clear_plan');
    expect(names).toContain('get_queue_status');
    expect(names).toContain('search_by_genre');
    expect(tools).toHaveLength(12);
  });

  it('skip_tool_callsScheduler', async () => {
    const deps = createDeps();
    const registry = createInMemoryToolRegistry();
    createToolFactory({ registry, ...deps });
    const tool = registry.get('skip');
    const result = await tool.execute({});
    expect(deps.scheduler.skip).toHaveBeenCalled();
    expect(result.handled).toBe(true);
    expect(result.state.playbackState).toBe('playing');
  });

  it('search_music_searchesAndQueuesResults', async () => {
    const songs = [
      { id: '1', name: '晴天', ar: [{ name: '周杰伦' }] },
      { id: '2', name: '稻香', ar: [{ name: '周杰伦' }] },
    ];
    const deps = createDeps({
      music: { search: vi.fn(async () => songs) },
    });
    const registry = createInMemoryToolRegistry();
    createToolFactory({ registry, ...deps });
    const tool = registry.get('search_music');
    const result = await tool.execute({ query: '周杰伦', limit: 5 });
    expect(deps.music.search).toHaveBeenCalledWith('周杰伦', 5);
    expect(deps.queue.insertNext).toHaveBeenCalledTimes(2);
    expect(result.results).toHaveLength(2);
    expect(result.queueUpdate).toBeTruthy();
  });

  it('search_music_filtersLiveVersions', async () => {
    const songs = [
      { id: '1', name: '晴天', ar: [{ name: '周杰伦' }] },
      { id: '2', name: '晴天 (Live)', ar: [{ name: '周杰伦' }] },
    ];
    const deps = createDeps({
      music: { search: vi.fn(async () => songs) },
    });
    const registry = createInMemoryToolRegistry();
    createToolFactory({ registry, ...deps });
    const tool = registry.get('search_music');
    const result = await tool.execute({ query: '晴天' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].name).toBe('晴天');
  });

  it('recommend_withoutPreference_callsFillQueue', async () => {
    const deps = createDeps({
      recommender: { ...createDeps().recommender, fillQueue: vi.fn(async () => [{ id: 'a' }]) },
    });
    const registry = createInMemoryToolRegistry();
    createToolFactory({ registry, ...deps });
    const tool = registry.get('recommend');
    const result = await tool.execute({});
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(10);
    expect(result.addedCount).toBe(1);
  });

  it('recommend_withPreference_callsFillQueueByPreference', async () => {
    const deps = createDeps({
      recommender: { ...createDeps().recommender, fillQueueByPreference: vi.fn(async () => [{ id: 'b' }]) },
    });
    const registry = createInMemoryToolRegistry();
    createToolFactory({ registry, ...deps });
    const tool = registry.get('recommend');
    const result = await tool.execute({ preference: '轻音乐' });
    expect(deps.recommender.fillQueueByPreference).toHaveBeenCalledWith('轻音乐', 10);
    expect(result.addedCount).toBe(1);
  });

  it('get_queue_status_returnsQueueInfo', async () => {
    const deps = createDeps({
      queue: { future: [{ id: 'a' }, { id: 'b' }], mode: 'sequential', upcomingSongs: [], insertNext: vi.fn() },
    });
    const registry = createInMemoryToolRegistry();
    createToolFactory({ registry, ...deps });
    const tool = registry.get('get_queue_status');
    const result = await tool.execute({});
    expect(result.length).toBe(2);
    expect(result.mode).toBe('sequential');
  });

  it('describeAll_excludesExecuteFunctions', () => {
    const deps = createDeps();
    const registry = createInMemoryToolRegistry();
    createToolFactory({ registry, ...deps });
    const descriptions = registry.describeAll();
    for (const desc of descriptions) {
      expect(desc.execute).toBeUndefined();
      expect(desc.name).toBeTruthy();
      expect(desc.parameters).toBeTruthy();
    }
  });

  // P1-5: search_by_genre tool — uses GenreSearchEngine for multi-source genre search
  it('registers search_by_genre tool', () => {
    const deps = createDeps();
    const registry = createInMemoryToolRegistry();
    createToolFactory({ registry, ...deps });
    const tool = registry.get('search_by_genre');
    expect(tool).toBeDefined();
    expect(tool.name).toBe('search_by_genre');
    expect(tool.parameters.properties.genre).toBeDefined();
    expect(tool.parameters.required).toContain('genre');
  });

  it('search_by_genre_callsMusicSearchAndQueuesResults', async () => {
    const songs = [
      { id: '1', name: 'Jazz Track 1', ar: [{ name: 'Artist A' }] },
      { id: '2', name: 'Jazz Track 2', ar: [{ name: 'Artist B' }] },
    ];
    const deps = createDeps({
      music: { search: vi.fn(async () => songs) },
    });
    const registry = createInMemoryToolRegistry();
    createToolFactory({ registry, ...deps });
    const tool = registry.get('search_by_genre');
    const result = await tool.execute({ genre: 'jazz', limit: 5 });
    expect(result.handled).toBe(true);
    expect(result.addedCount).toBeGreaterThan(0);
    expect(deps.queue.insertNext).toHaveBeenCalled();
  });

  it('search_by_genre_returnsErrorWhenGenreMissing', async () => {
    const deps = createDeps();
    const registry = createInMemoryToolRegistry();
    createToolFactory({ registry, ...deps });
    const tool = registry.get('search_by_genre');
    const result = await tool.execute({});
    expect(result.handled).toBe(false);
    expect(result.error).toBeDefined();
  });
});
