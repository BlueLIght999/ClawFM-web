import { describe, it, expect, vi } from 'vitest';

import { ChatStyleAnalyzer } from '../domain/profile/analyzers/ChatStyleAnalyzer.js';
import { EmotionAnalyzer } from '../domain/profile/analyzers/EmotionAnalyzer.js';
import { DailyHabitAnalyzer } from '../domain/profile/analyzers/DailyHabitAnalyzer.js';

/**
 * Tests for the profile analyzer domain layer — pure domain logic with
 * no IO, no infrastructure/db/application imports.
 *
 * Coverage:
 * - ChatStyleAnalyzer: empty evidence, concise/detailed classification,
 *   formality scoring, emoji detection, question rate, tag generation
 * - EmotionAnalyzer: mood scores from profile/chat, dominant mood,
 *   shift detection (up/down/stable), event emission on shift
 * - DailyHabitAnalyzer: peak hour/period, night owl habit,
 *   consistency calculation, habit generation
 */

// ─── ChatStyleAnalyzer ───

describe('ChatStyleAnalyzer', () => {
  it('analyze_emptyEvidence_returnsUnknownStyle', async () => {
    // Given no chat evidence
    const analyzer = new ChatStyleAnalyzer();

    // When
    const result = await analyzer.analyze({}, { chatEvidence: [] });

    // Then
    expect(result.style).toBe('unknown');
    expect(result.tags).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it('analyze_shortMessages_classifiesAsConcise', async () => {
    // Given short user messages (avg length < 30)
    const chatEvidence = [
      { role: 'user', content: '嗯' },
      { role: 'user', content: '好的' },
    ];
    const analyzer = new ChatStyleAnalyzer();

    // When
    const result = await analyzer.analyze({}, { chatEvidence });

    // Then
    expect(result.style).toMatch(/^concise_/);
  });

  it('analyze_longMessages_classifiesAsDetailed', async () => {
    // Given long user messages (avg length > 30)
    const longContent = '这是一段非常长的消息内容，用来测试当用户发送的消息平均长度超过三十个字符时，分析器应该将其分类为详细型风格';
    const chatEvidence = [
      { role: 'user', content: longContent },
    ];
    const analyzer = new ChatStyleAnalyzer();

    // When
    const result = await analyzer.analyze({}, { chatEvidence });

    // Then
    expect(result.style).toMatch(/^detailed_/);
  });

  it('analyze_formalMarkers_increasesFormalityScore', async () => {
    // Given messages with formal markers (您, 请问, 谢谢)
    const chatEvidence = [
      { role: 'user', content: '您好，请问有什么推荐的歌曲吗？谢谢' },
    ];
    const analyzer = new ChatStyleAnalyzer();

    // When
    const result = await analyzer.analyze({}, { chatEvidence });

    // Then — formal markers dominate, formality > 0.6 → formal
    expect(result.metrics.formalityScore).toBeGreaterThan(0.6);
    expect(result.style).toMatch(/_formal$/);
  });

  it('analyze_casualMarkers_classifiesAsCasual', async () => {
    // Given messages with casual markers (哈哈, 嗯, 哦)
    const chatEvidence = [
      { role: 'user', content: '哈哈，这首歌不错嗯' },
      { role: 'user', content: '哦，好的好的' },
    ];
    const analyzer = new ChatStyleAnalyzer();

    // When
    const result = await analyzer.analyze({}, { chatEvidence });

    // Then — casual markers dominate, formality < 0.6 → casual
    expect(result.metrics.formalityScore).toBeLessThan(0.6);
    expect(result.style).toMatch(/_casual$/);
  });

  it('analyze_emojiInMessages_detectsEmojiUsage', async () => {
    // Given messages containing emoji
    const chatEvidence = [
      { role: 'user', content: '你好😊哈哈' },
    ];
    const analyzer = new ChatStyleAnalyzer();

    // When
    const result = await analyzer.analyze({}, { chatEvidence });

    // Then
    expect(result.metrics.emojiUsage).toBeGreaterThan(0);
  });

  it('analyze_questionsInMessages_calculatesQuestionRate', async () => {
    // Given messages where half contain question marks
    const chatEvidence = [
      { role: 'user', content: '今天天气怎么样？' },
      { role: 'user', content: '好的' },
    ];
    const analyzer = new ChatStyleAnalyzer();

    // When
    const result = await analyzer.analyze({}, { chatEvidence });

    // Then — 1 out of 2 messages has a question mark
    expect(result.metrics.questionRate).toBe(0.5);
  });

  it('analyze_highQuestionRate_generatesInquisitiveTag', async () => {
    // Given messages where question rate > 0.3
    const chatEvidence = [
      { role: 'user', content: '嗯？' },
      { role: 'user', content: '哦？' },
    ];
    const analyzer = new ChatStyleAnalyzer();

    // When
    const result = await analyzer.analyze({}, { chatEvidence });

    // Then — inquisitive tag should be present
    const inquisitiveTag = result.tags.find(t => t.name === 'inquisitive');
    expect(inquisitiveTag).toBeDefined();
    expect(inquisitiveTag.dimension).toBe('chat');
  });

  it('analyze_withResults_generatesStyleTags', async () => {
    // Given concise_casual style messages
    const chatEvidence = [
      { role: 'user', content: '嗯' },
      { role: 'user', content: '哦' },
    ];
    const analyzer = new ChatStyleAnalyzer();

    // When
    const result = await analyzer.analyze({}, { chatEvidence });

    // Then — should have concise and casual tags
    const tagNames = result.tags.map(t => t.name);
    expect(tagNames).toContain('concise');
    expect(tagNames).toContain('casual');
  });

  it('analyze_withEventBus_emitsAnalysisCompleted', async () => {
    // Given an event bus
    const bus = { emit: vi.fn() };
    const analyzer = new ChatStyleAnalyzer({ eventBus: bus });
    const chatEvidence = [{ role: 'user', content: '你好' }];

    // When
    await analyzer.analyze({}, { chatEvidence });

    // Then
    expect(bus.emit).toHaveBeenCalledWith(
      'analysis:completed',
      expect.objectContaining({
        analyzer: 'ChatStyleAnalyzer',
        type: 'chat_style',
      })
    );
  });
});

// ─── EmotionAnalyzer ───

describe('EmotionAnalyzer', () => {
  it('analyze_profileMoodTags_contributesToMoodScores', async () => {
    // Given a profile with mood tags
    const profile = {
      tags: { mood: { happy: { weight: 0.8 }, sad: { weight: 0.2 } } },
    };
    const analyzer = new EmotionAnalyzer();

    // When
    const result = await analyzer.analyze(profile, { listenEvidence: [], chatEvidence: [] });

    // Then
    expect(result.moodScores.happy).toBeGreaterThan(result.moodScores.sad);
    expect(result.currentMood).toBe('happy');
  });

  it('analyze_chatKeywords_contributeToMoodScores', async () => {
    // Given chat evidence with happy keywords
    const chatEvidence = [{ content: '今天很开心，非常快乐' }];
    const analyzer = new EmotionAnalyzer();

    // When
    const result = await analyzer.analyze({}, { listenEvidence: [], chatEvidence });

    // Then
    expect(result.moodScores.happy).toBeGreaterThan(0);
    expect(result.currentMood).toBe('happy');
  });

  it('analyze_multipleMoods_findsDominantMood', async () => {
    // Given a profile with multiple mood tags of different weights
    const profile = {
      tags: { mood: { happy: { weight: 0.3 }, energetic: { weight: 0.5 } } },
    };
    const analyzer = new EmotionAnalyzer();

    // When
    const result = await analyzer.analyze(profile, { listenEvidence: [], chatEvidence: [] });

    // Then — energetic has higher weight
    expect(result.currentMood).toBe('energetic');
    expect(result.moodScores.energetic).toBeGreaterThan(result.moodScores.happy);
  });

  it('analyze_noMoodData_defaultsToCalm', async () => {
    // Given no mood data in profile or chat
    const analyzer = new EmotionAnalyzer();

    // When
    const result = await analyzer.analyze({}, { listenEvidence: [], chatEvidence: [] });

    // Then — default mood is calm
    expect(result.currentMood).toBe('calm');
  });

  it('analyze_moodShiftUp_detectsUpDirection', async () => {
    // Given previous mood was calm, current is happy (higher energy)
    const profile = { analysis: { emotion: { currentMood: 'calm' } } };
    const chatEvidence = [{ content: '今天很开心，非常快乐' }];
    const analyzer = new EmotionAnalyzer();

    // When
    const result = await analyzer.analyze(profile, { listenEvidence: [], chatEvidence });

    // Then — calm → happy is an upward shift
    expect(result.shift).toBe('up');
    expect(result.previousMood).toBe('calm');
  });

  it('analyze_moodShiftDown_detectsDownDirection', async () => {
    // Given previous mood was energetic, current is sad (lower energy)
    const profile = { analysis: { emotion: { currentMood: 'energetic' } } };
    const chatEvidence = [{ content: '今天很难过，伤心' }];
    const analyzer = new EmotionAnalyzer();

    // When
    const result = await analyzer.analyze(profile, { listenEvidence: [], chatEvidence });

    // Then — energetic → sad is a downward shift
    expect(result.shift).toBe('down');
    expect(result.previousMood).toBe('energetic');
  });

  it('analyze_moodStable_returnsStableDirection', async () => {
    // Given previous mood is the same as current
    const profile = { analysis: { emotion: { currentMood: 'happy' } } };
    const chatEvidence = [{ content: '今天很开心' }];
    const analyzer = new EmotionAnalyzer();

    // When
    const result = await analyzer.analyze(profile, { listenEvidence: [], chatEvidence });

    // Then — same mood → stable
    expect(result.shift).toBe('stable');
    expect(result.previousMood).toBe('happy');
  });

  it('analyze_moodShift_emitsEmotionShiftedEvent', async () => {
    // Given an event bus and a mood shift scenario
    const bus = { emit: vi.fn() };
    const profile = { analysis: { emotion: { currentMood: 'calm' } } };
    const chatEvidence = [{ content: '今天很开心，非常快乐' }];
    const analyzer = new EmotionAnalyzer({ eventBus: bus });

    // When
    await analyzer.analyze(profile, { listenEvidence: [], chatEvidence });

    // Then — emotion:shifted event should be emitted
    expect(bus.emit).toHaveBeenCalledWith(
      'emotion:shifted',
      expect.objectContaining({
        analyzer: 'EmotionAnalyzer',
        currentMood: 'happy',
        shift: 'up',
      })
    );
  });

  it('analyze_moodStable_doesNotEmitEvent', async () => {
    // Given an event bus and a stable mood scenario
    const bus = { emit: vi.fn() };
    const profile = { analysis: { emotion: { currentMood: 'happy' } } };
    const chatEvidence = [{ content: '今天很开心' }];
    const analyzer = new EmotionAnalyzer({ eventBus: bus });

    // When
    await analyzer.analyze(profile, { listenEvidence: [], chatEvidence });

    // Then — no emotion:shifted event
    expect(bus.emit).not.toHaveBeenCalledWith('emotion:shifted', expect.anything());
  });
});

// ─── DailyHabitAnalyzer ───

describe('DailyHabitAnalyzer', () => {
  it('analyze_timeEvidence_detectsPeakHour', async () => {
    // Given time evidence concentrated at hour 9
    const timeEvidence = [
      { type: 'time_pattern', hour: 9, count: 5 },
      { type: 'time_pattern', hour: 21, count: 3 },
    ];
    const analyzer = new DailyHabitAnalyzer();

    // When
    const result = await analyzer.analyze({}, { timeEvidence, listenEvidence: [] });

    // Then
    expect(result.peakHour).toBe(9);
  });

  it('analyze_timeEvidence_detectsPeakPeriod', async () => {
    // Given time evidence with morning dominance
    const timeEvidence = [
      { type: 'time_pattern', hour: 9, count: 5 },
      { type: 'time_pattern', hour: 21, count: 3 },
    ];
    const analyzer = new DailyHabitAnalyzer();

    // When
    const result = await analyzer.analyze({}, { timeEvidence, listenEvidence: [] });

    // Then — hour 9 is morning (6-11), which has count 5 > evening's 3
    expect(result.peakPeriod).toBe('morning');
  });

  it('analyze_nightPeak_generatesNightOwlHabit', async () => {
    // Given time evidence concentrated in night hours (23-5)
    const timeEvidence = [
      { type: 'time_pattern', hour: 23, count: 10 },
      { type: 'time_pattern', hour: 1, count: 5 },
    ];
    const analyzer = new DailyHabitAnalyzer();

    // When
    const result = await analyzer.analyze({}, { timeEvidence, listenEvidence: [] });

    // Then
    expect(result.peakPeriod).toBe('night');
    const nightOwlTag = result.habits.find(h => h.name === 'night_owl');
    expect(nightOwlTag).toBeDefined();
    expect(nightOwlTag.dimension).toBe('behavior');
  });

  it('analyze_morningPeak_generatesMorningPersonHabit', async () => {
    // Given time evidence concentrated in morning hours
    const timeEvidence = [
      { type: 'time_pattern', hour: 7, count: 8 },
      { type: 'time_pattern', hour: 9, count: 4 },
    ];
    const analyzer = new DailyHabitAnalyzer();

    // When
    const result = await analyzer.analyze({}, { timeEvidence, listenEvidence: [] });

    // Then
    expect(result.peakPeriod).toBe('morning');
    const morningTag = result.habits.find(h => h.name === 'morning_person');
    expect(morningTag).toBeDefined();
  });

  it('analyze_concentratedListening_calculatesHighConsistency', async () => {
    // Given all listening in one period
    const timeEvidence = [
      { type: 'time_pattern', hour: 9, count: 10 },
    ];
    const analyzer = new DailyHabitAnalyzer();

    // When
    const result = await analyzer.analyze({}, { timeEvidence, listenEvidence: [] });

    // Then — 100% in morning → consistency = 1.0
    expect(result.consistency).toBe(1);
  });

  it('analyze_spreadListening_calculatesLowConsistency', async () => {
    // Given listening spread evenly across all periods
    const timeEvidence = [
      { type: 'time_pattern', hour: 9, count: 2 },
      { type: 'time_pattern', hour: 14, count: 2 },
      { type: 'time_pattern', hour: 20, count: 2 },
      { type: 'time_pattern', hour: 1, count: 2 },
    ];
    const analyzer = new DailyHabitAnalyzer();

    // When
    const result = await analyzer.analyze({}, { timeEvidence, listenEvidence: [] });

    // Then — max period / total = 2/8 = 0.25
    expect(result.consistency).toBeLessThan(0.3);
    const explorerTag = result.habits.find(h => h.name === 'explorer');
    expect(explorerTag).toBeDefined();
  });

  it('analyze_highConsistency_generatesLoyalistHabit', async () => {
    // Given concentrated listening (consistency > 0.5)
    const timeEvidence = [
      { type: 'time_pattern', hour: 20, count: 8 },
      { type: 'time_pattern', hour: 21, count: 2 },
    ];
    const analyzer = new DailyHabitAnalyzer();

    // When
    const result = await analyzer.analyze({}, { timeEvidence, listenEvidence: [] });

    // Then — evening has 10 out of 10 total → consistency = 1.0 > 0.5
    const loyalistTag = result.habits.find(h => h.name === 'loyalist');
    expect(loyalistTag).toBeDefined();
  });

  it('analyze_listenEvidenceTimestamps_deriveHourCounts', async () => {
    // Given listen evidence with timestamps (no explicit time_pattern evidence)
    const listenEvidence = [
      { playedAt: '2026-01-01T09:00:00' },
      { playedAt: '2026-01-01T09:30:00' },
      { playedAt: '2026-01-01T21:00:00' },
    ];
    const analyzer = new DailyHabitAnalyzer();

    // When
    const result = await analyzer.analyze({}, { timeEvidence: [], listenEvidence });

    // Then — hour 9 has count 2, hour 21 has count 1
    expect(result.peakHour).toBe(9);
    expect(result.peakPeriod).toBe('morning');
  });

  it('analyze_withEventBus_emitsAnalysisCompleted', async () => {
    // Given an event bus
    const bus = { emit: vi.fn() };
    const analyzer = new DailyHabitAnalyzer({ eventBus: bus });
    const timeEvidence = [{ type: 'time_pattern', hour: 10, count: 3 }];

    // When
    await analyzer.analyze({}, { timeEvidence, listenEvidence: [] });

    // Then
    expect(bus.emit).toHaveBeenCalledWith(
      'analysis:completed',
      expect.objectContaining({
        analyzer: 'DailyHabitAnalyzer',
        type: 'daily_habit',
      })
    );
  });
});
