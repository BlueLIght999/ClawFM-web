import { describe, it, expect, vi } from 'vitest';
import { BaseCollector } from '../domain/profile/collectors/BaseCollector.js';
import { ListenHistoryCollector } from '../domain/profile/collectors/ListenHistoryCollector.js';
import { ChatHistoryCollector } from '../domain/profile/collectors/ChatHistoryCollector.js';
import { SkipBehaviorCollector } from '../domain/profile/collectors/SkipBehaviorCollector.js';
import { TimePatternCollector } from '../domain/profile/collectors/TimePatternCollector.js';
import { SearchQueryCollector } from '../domain/profile/collectors/SearchQueryCollector.js';
import { PlanSelectionCollector } from '../domain/profile/collectors/PlanSelectionCollector.js';

describe('BaseCollector', () => {
  it('constructor_withoutName_defaultsToConstructorName', () => {
    const collector = new BaseCollector();
    expect(collector.name).toBe('BaseCollector');
    expect(collector.eventBus).toBeNull();
  });

  it('constructor_withNameAndEventBus_storesThem', () => {
    const bus = { emit: vi.fn() };
    const collector = new BaseCollector({ name: 'Custom', eventBus: bus });
    expect(collector.name).toBe('Custom');
    expect(collector.eventBus).toBe(bus);
  });

  it('collect_notOverridden_throwsNotImplemented', async () => {
    const collector = new BaseCollector();
    await expect(collector.collect({})).rejects.toThrow('Not implemented');
  });

  it('collectedAt_returnsIsoTimestamp', () => {
    const collector = new BaseCollector();
    const ts = collector.collectedAt;
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('emit_withoutEventBus_isNoop', () => {
    const collector = new BaseCollector();
    expect(() => collector.emit('evt', { a: 1 })).not.toThrow();
  });

  it('emit_withEventBus_mergesCollectorNameIntoPayload', () => {
    const bus = { emit: vi.fn() };
    const collector = new BaseCollector({ name: 'X', eventBus: bus });
    collector.emit('evt', { a: 1 });
    expect(bus.emit).toHaveBeenCalledWith('evt', { collector: 'X', a: 1 });
  });
});

describe('ListenHistoryCollector', () => {
  it('collect_returnsEvidenceFromHistory', async () => {
    const mockRepo = {
      history: vi.fn(() => [
        {
          songId: '1',
          title: 'Song',
          artist: 'A',
          playedAt: '2026-01-01T10:00:00Z',
          source: 'queue',
        },
      ]),
    };
    const collector = new ListenHistoryCollector();

    const result = await collector.collect({ listenHistoryRepository: mockRepo });

    expect(result.count).toBe(1);
    expect(result.evidence[0].type).toBe('listen');
    expect(result.evidence[0].songId).toBe('1');
    expect(result.evidence[0].playedAt).toBe('2026-01-01T10:00:00Z');
    expect(mockRepo.history).toHaveBeenCalledWith(100);
  });

  it('collect_legacySnakeCaseFields_normalizesToCamelCase', async () => {
    const mockRepo = {
      history: vi.fn(() => [
        { song_id: '9', title: 'T', artist: 'Ar', played_at: '2026-02-02T08:00:00Z', source: 'fm' },
      ]),
    };
    const collector = new ListenHistoryCollector();

    const result = await collector.collect({ listenHistoryRepository: mockRepo });

    expect(result.evidence[0].songId).toBe('9');
    expect(result.evidence[0].playedAt).toBe('2026-02-02T08:00:00Z');
  });

  it('collect_emptyHistory_returnsEmptyEvidence', async () => {
    const mockRepo = { history: vi.fn(() => []) };
    const collector = new ListenHistoryCollector();

    const result = await collector.collect({ listenHistoryRepository: mockRepo });

    expect(result.count).toBe(0);
    expect(result.evidence).toEqual([]);
  });

  it('collect_missingRepository_returnsEmptyEvidence', async () => {
    const collector = new ListenHistoryCollector();

    const result = await collector.collect({});

    expect(result.count).toBe(0);
    expect(result.evidence).toEqual([]);
  });

  it('collect_withEventBus_emitsCollectionCompleted', async () => {
    const bus = { emit: vi.fn() };
    const mockRepo = {
      history: vi.fn(() => [
        { songId: '1', title: 'S', artist: 'A', playedAt: '2026-01-01T10:00:00Z', source: 'queue' },
      ]),
    };
    const collector = new ListenHistoryCollector({ eventBus: bus });

    await collector.collect({ listenHistoryRepository: mockRepo });

    expect(bus.emit).toHaveBeenCalledWith('collection:completed', {
      collector: 'ListenHistoryCollector',
      evidenceCount: 1,
    });
  });
});

describe('ChatHistoryCollector', () => {
  it('collect_returnsEvidenceFromRecent', async () => {
    const mockRepo = {
      recent: vi.fn(() => [{ role: 'user', content: 'hi', createdAt: '2026-01-01T10:00:00Z' }]),
    };
    const collector = new ChatHistoryCollector();

    const result = await collector.collect({ chatHistoryRepository: mockRepo });

    expect(result.count).toBe(1);
    expect(result.evidence[0].type).toBe('chat');
    expect(result.evidence[0].role).toBe('user');
    expect(result.evidence[0].content).toBe('hi');
  });

  it('collect_whenRepositoryIsFunction_callsItWithLimit', async () => {
    const fn = vi.fn(() => [
      { role: 'assistant', content: 'hello', createdAt: '2026-01-01T10:00:00Z' },
    ]);
    const collector = new ChatHistoryCollector();

    const result = await collector.collect({ chatHistoryRepository: fn });

    expect(fn).toHaveBeenCalledWith(100);
    expect(result.evidence[0].role).toBe('assistant');
  });

  it('collect_emptyHistory_returnsEmptyEvidence', async () => {
    const mockRepo = { recent: vi.fn(() => []) };
    const collector = new ChatHistoryCollector();

    const result = await collector.collect({ chatHistoryRepository: mockRepo });

    expect(result.count).toBe(0);
    expect(result.evidence).toEqual([]);
  });

  it('collect_withEventBus_emitsCollectionCompleted', async () => {
    const bus = { emit: vi.fn() };
    const mockRepo = {
      recent: vi.fn(() => [{ role: 'user', content: 'hi', createdAt: '2026-01-01T10:00:00Z' }]),
    };
    const collector = new ChatHistoryCollector({ eventBus: bus });

    await collector.collect({ chatHistoryRepository: mockRepo });

    expect(bus.emit).toHaveBeenCalledWith('collection:completed', {
      collector: 'ChatHistoryCollector',
      evidenceCount: 1,
    });
  });
});

describe('SkipBehaviorCollector', () => {
  it('collect_identifiesSkippedBySource_returnsSkipEvidenceAndRate', async () => {
    const mockRepo = {
      history: vi.fn(() => [
        { songId: '1', title: 'A', artist: 'X', playedAt: '2026-01-01T10:00:00Z', source: 'queue' },
        { songId: '2', title: 'B', artist: 'Y', playedAt: '2026-01-01T10:01:00Z', source: 'skip' },
      ]),
    };
    const collector = new SkipBehaviorCollector();

    const result = await collector.collect({ listenHistoryRepository: mockRepo });

    expect(result.count).toBe(1);
    expect(result.evidence[0].type).toBe('skip');
    expect(result.evidence[0].songId).toBe('2');
    expect(result.skipRate).toBe(0.5);
  });

  it('collect_identifiesSkippedByFlag_returnsSkipEvidence', async () => {
    const mockRepo = {
      history: vi.fn(() => [
        {
          songId: '1',
          title: 'A',
          artist: 'X',
          playedAt: '2026-01-01T10:00:00Z',
          source: 'queue',
          skipped: true,
        },
      ]),
    };
    const collector = new SkipBehaviorCollector();

    const result = await collector.collect({ listenHistoryRepository: mockRepo });

    expect(result.count).toBe(1);
    expect(result.skipRate).toBe(1);
  });

  it('collect_noSkips_returnsZeroRate', async () => {
    const mockRepo = {
      history: vi.fn(() => [
        { songId: '1', title: 'A', artist: 'X', playedAt: '2026-01-01T10:00:00Z', source: 'queue' },
      ]),
    };
    const collector = new SkipBehaviorCollector();

    const result = await collector.collect({ listenHistoryRepository: mockRepo });

    expect(result.count).toBe(0);
    expect(result.skipRate).toBe(0);
  });

  it('collect_emptyHistory_returnsZeroRate', async () => {
    const mockRepo = { history: vi.fn(() => []) };
    const collector = new SkipBehaviorCollector();

    const result = await collector.collect({ listenHistoryRepository: mockRepo });

    expect(result.count).toBe(0);
    expect(result.skipRate).toBe(0);
  });

  it('collect_withEventBus_emitsCollectionCompleted', async () => {
    const bus = { emit: vi.fn() };
    const mockRepo = {
      history: vi.fn(() => [
        { songId: '1', title: 'A', artist: 'X', playedAt: '2026-01-01T10:00:00Z', source: 'skip' },
      ]),
    };
    const collector = new SkipBehaviorCollector({ eventBus: bus });

    await collector.collect({ listenHistoryRepository: mockRepo });

    expect(bus.emit).toHaveBeenCalledWith('collection:completed', {
      collector: 'SkipBehaviorCollector',
      evidenceCount: 1,
    });
  });
});

describe('TimePatternCollector', () => {
  // Timestamps are written without a trailing 'Z' so they parse as local time;
  // getHours() then returns the written hour deterministically across TZs.
  it('collect_groupsByHourAndReturnsPeak', async () => {
    const mockRepo = {
      history: vi.fn(() => [
        { playedAt: '2026-01-01T09:00:00' },
        { playedAt: '2026-01-01T09:30:00' },
        { playedAt: '2026-01-01T21:00:00' },
      ]),
    };
    const collector = new TimePatternCollector();

    const result = await collector.collect({ listenHistoryRepository: mockRepo });

    expect(result.count).toBe(2); // hours 9 and 21
    expect(result.peakHour).toBe(9);
    expect(result.peakPeriod).toBe('morning');
    const evening = result.evidence.find((e) => e.hour === 21);
    expect(evening.period).toBe('evening');
  });

  it('collect_assignsNightPeriodForLateHours', async () => {
    const mockRepo = {
      history: vi.fn(() => [
        { playedAt: '2026-01-01T23:00:00' },
        { playedAt: '2026-01-01T02:00:00' },
      ]),
    };
    const collector = new TimePatternCollector();

    const result = await collector.collect({ listenHistoryRepository: mockRepo });

    expect(result.count).toBe(2);
    const night23 = result.evidence.find((e) => e.hour === 23);
    const night2 = result.evidence.find((e) => e.hour === 2);
    expect(night23.period).toBe('night');
    expect(night2.period).toBe('night');
  });

  it('collect_invalidTimestamps_areIgnored', async () => {
    const mockRepo = {
      history: vi.fn(() => [
        { playedAt: 'not-a-date' },
        { playedAt: null },
        { playedAt: '2026-01-01T12:00:00' },
      ]),
    };
    const collector = new TimePatternCollector();

    const result = await collector.collect({ listenHistoryRepository: mockRepo });

    expect(result.count).toBe(1);
    expect(result.peakHour).toBe(12);
    expect(result.peakPeriod).toBe('afternoon');
  });

  it('collect_emptyHistory_returnsNullPeak', async () => {
    const mockRepo = { history: vi.fn(() => []) };
    const collector = new TimePatternCollector();

    const result = await collector.collect({ listenHistoryRepository: mockRepo });

    expect(result.count).toBe(0);
    expect(result.peakHour).toBeNull();
    expect(result.peakPeriod).toBeNull();
  });

  it('collect_withEventBus_emitsCollectionCompleted', async () => {
    const bus = { emit: vi.fn() };
    const mockRepo = { history: vi.fn(() => [{ playedAt: '2026-01-01T10:00:00' }]) };
    const collector = new TimePatternCollector({ eventBus: bus });

    await collector.collect({ listenHistoryRepository: mockRepo });

    expect(bus.emit).toHaveBeenCalledWith('collection:completed', {
      collector: 'TimePatternCollector',
      evidenceCount: 1,
    });
  });
});

describe('SearchQueryCollector', () => {
  it('collect_extractsSearchQueriesFromUserMessages', async () => {
    const mockRepo = {
      recent: vi.fn(() => [
        { role: 'user', content: '想听周杰伦的歌', createdAt: '2026-01-01T10:00:00Z' },
        { role: 'assistant', content: '好的', createdAt: '2026-01-01T10:00:01Z' },
        { role: 'user', content: '你好', createdAt: '2026-01-01T10:00:02Z' },
      ]),
    };
    const collector = new SearchQueryCollector();

    const result = await collector.collect({ chatHistoryRepository: mockRepo });

    expect(result.count).toBe(1);
    expect(result.evidence[0].type).toBe('search');
    expect(result.evidence[0].query).toBe('想听周杰伦的歌');
    expect(result.evidence[0].extractedKeywords).toContain('周杰伦歌');
  });

  it('collect_detectsEnglishSearchTriggers', async () => {
    const mockRepo = {
      recent: vi.fn(() => [
        { role: 'user', content: 'play some jazz', createdAt: '2026-01-01T10:00:00Z' },
      ]),
    };
    const collector = new SearchQueryCollector();

    const result = await collector.collect({ chatHistoryRepository: mockRepo });

    expect(result.count).toBe(1);
    expect(result.evidence[0].extractedKeywords).toEqual(
      expect.arrayContaining(['play', 'some', 'jazz'])
    );
  });

  it('collect_detectsKeywordStarters_withoutTriggerSubstr', async () => {
    // Starts with keyword starter '想' but contains no 听/play/search trigger,
    // so detection fires via the starter path. Particles (想/要/一首) are
    // stripped, leaving the clean keyword '轻音乐'.
    const mockRepo = {
      recent: vi.fn(() => [
        { role: 'user', content: '想要一首轻音乐', createdAt: '2026-01-01T10:00:00Z' },
      ]),
    };
    const collector = new SearchQueryCollector();

    const result = await collector.collect({ chatHistoryRepository: mockRepo });

    expect(result.count).toBe(1);
    expect(result.evidence[0].extractedKeywords).toContain('轻音乐');
  });

  it('collect_ignoresAssistantMessages', async () => {
    const mockRepo = {
      recent: vi.fn(() => [
        { role: 'assistant', content: '想听点什么', createdAt: '2026-01-01T10:00:00Z' },
      ]),
    };
    const collector = new SearchQueryCollector();

    const result = await collector.collect({ chatHistoryRepository: mockRepo });

    expect(result.count).toBe(0);
  });

  it('collect_emptyHistory_returnsEmptyEvidence', async () => {
    const mockRepo = { recent: vi.fn(() => []) };
    const collector = new SearchQueryCollector();

    const result = await collector.collect({ chatHistoryRepository: mockRepo });

    expect(result.count).toBe(0);
  });

  it('collect_withEventBus_emitsCollectionCompleted', async () => {
    const bus = { emit: vi.fn() };
    const mockRepo = {
      recent: vi.fn(() => [
        { role: 'user', content: '来一首歌', createdAt: '2026-01-01T10:00:00Z' },
      ]),
    };
    const collector = new SearchQueryCollector({ eventBus: bus });

    await collector.collect({ chatHistoryRepository: mockRepo });

    expect(bus.emit).toHaveBeenCalledWith('collection:completed', {
      collector: 'SearchQueryCollector',
      evidenceCount: 1,
    });
  });
});

describe('PlanSelectionCollector', () => {
  it('collect_pinnedPlan_returnsPinnedEvidence', async () => {
    const mockRepo = {
      get: vi.fn(() => ({
        blocks: [
          { id: 'morning', label: '早晨' },
          { id: 'night', label: '夜晚' },
        ],
        autoMode: false,
        pinned: true,
        currentBlockIndex: 1,
        pinnedBlockIndex: 1,
      })),
    };
    const collector = new PlanSelectionCollector();

    const result = await collector.collect({ planRepository: mockRepo });

    expect(result.count).toBe(1);
    expect(result.evidence[0].action).toBe('pinned');
    expect(result.evidence[0].blockId).toBe('night');
    expect(result.evidence[0].blockLabel).toBe('夜晚');
  });

  it('collect_selectedPlan_returnsSelectedEvidence', async () => {
    const mockRepo = {
      get: vi.fn(() => ({
        blocks: [{ id: 'morning', label: '早晨' }],
        autoMode: false,
        pinned: false,
        currentBlockIndex: 0,
      })),
    };
    const collector = new PlanSelectionCollector();

    const result = await collector.collect({ planRepository: mockRepo });

    expect(result.count).toBe(1);
    expect(result.evidence[0].action).toBe('selected');
    expect(result.evidence[0].blockId).toBe('morning');
  });

  it('collect_autoModePlan_returnsClearedEvidence', async () => {
    const mockRepo = {
      get: vi.fn(() => ({
        blocks: [{ id: 'morning', label: '早晨' }],
        autoMode: true,
        pinned: false,
        currentBlockIndex: null,
      })),
    };
    const collector = new PlanSelectionCollector();

    const result = await collector.collect({ planRepository: mockRepo });

    expect(result.count).toBe(1);
    expect(result.evidence[0].action).toBe('cleared');
    expect(result.evidence[0].blockId).toBeNull();
  });

  it('collect_outOfRangeIndex_returnsActionWithNullBlock', async () => {
    const mockRepo = {
      get: vi.fn(() => ({
        blocks: [{ id: 'morning', label: '早晨' }],
        autoMode: false,
        pinned: false,
        currentBlockIndex: 9,
      })),
    };
    const collector = new PlanSelectionCollector();

    const result = await collector.collect({ planRepository: mockRepo });

    expect(result.evidence[0].action).toBe('selected');
    expect(result.evidence[0].blockId).toBeNull();
  });

  it('collect_noPlanData_returnsEmptyEvidence', async () => {
    const mockRepo = { get: vi.fn(() => null) };
    const collector = new PlanSelectionCollector();

    const result = await collector.collect({ planRepository: mockRepo });

    expect(result.count).toBe(0);
    expect(result.evidence).toEqual([]);
  });

  it('collect_missingRepository_returnsEmptyEvidence', async () => {
    const collector = new PlanSelectionCollector();

    const result = await collector.collect({});

    expect(result.count).toBe(0);
  });

  it('collect_withEventBus_emitsCollectionCompleted', async () => {
    const bus = { emit: vi.fn() };
    const mockRepo = {
      get: vi.fn(() => ({
        blocks: [{ id: 'morning', label: '早晨' }],
        autoMode: false,
        pinned: false,
        currentBlockIndex: 0,
      })),
    };
    const collector = new PlanSelectionCollector({ eventBus: bus });

    await collector.collect({ planRepository: mockRepo });

    expect(bus.emit).toHaveBeenCalledWith('collection:completed', {
      collector: 'PlanSelectionCollector',
      evidenceCount: 1,
    });
  });
});
