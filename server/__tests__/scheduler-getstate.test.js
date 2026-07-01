import { describe, it, expect } from 'vitest';
import { RadioScheduler } from '../services/scheduler.js';
import { queue } from '../services/queue.js';

/**
 * 行为测试 —— scheduler.getState() 应输出规范化的 song（带稳定 DTO 字段）。
 * 接线 toPlayableSong 到 RADIO_STATE 的单一漏斗(getState)，使所有 emit 点
 * 的 currentSong 都带 title/artist 稳定字段，同时兼容旧 name/ar(方案B)。
 */
describe('RadioScheduler.getState song normalization', () => {
  it('currentSong_hasStableDtoFields_andLegacyFields', () => {
    const scheduler = new RadioScheduler();
    scheduler.playhead.currentSong = {
      id: 186016,
      name: '晴天',
      ar: [{ name: '周杰伦' }],
      al: { name: '叶惠美', picUrl: 'http://p/c.jpg' },
      dt: 269000,
    };
    scheduler.playhead.isPlaying = true;

    const state = scheduler.getState();

    // 稳定 DTO 字段（新前端可迁移）
    expect(state.currentSong.title).toBe('晴天');
    expect(state.currentSong.artist).toBe('周杰伦');
    // 兼容旧字段（旧前端不改仍可读）
    expect(state.currentSong.name).toBe('晴天');
    expect(state.currentSong.ar).toEqual([{ name: '周杰伦' }]);
  });

  it('nullCurrentSong_staysNull', () => {
    const scheduler = new RadioScheduler();
    const state = scheduler.getState();
    expect(state.currentSong).toBeNull();
  });

  it('upcomingSongs_haveStableDtoFields_andLegacyFields', () => {
    const scheduler = new RadioScheduler();
    queue.future = [];
    queue.future.push({ id: 1, name: 'Finger', ar: [{ name: 'toe' }], dt: 200000 });

    const state = scheduler.getState();
    const first = state.upcomingSongs[0];

    // 稳定 DTO 字段
    expect(first.title).toBe('Finger');
    expect(first.artist).toBe('toe');
    // 兼容旧字段
    expect(first.name).toBe('Finger');
    expect(first.ar).toEqual([{ name: 'toe' }]);

    queue.future = [];
  });
});
