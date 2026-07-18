import { describe, it, expect } from 'vitest';
import {
  slotUserInput,
  slotMemory,
  slotEnvironment,
  slotExecutionTrace,
  assembleContextPrompt,
} from '../domain/hosting/contextSlots.js';

describe('slotUserInput', () => {
  it('returnsEmpty_whenNoInput', () => {
    expect(slotUserInput('', '')).toBe('');
  });

  it('includesInputSection_whenInputProvided', () => {
    const result = slotUserInput('Hello DJ', '');
    expect(result).toContain('### Recent Input');
    expect(result).toContain('Hello DJ');
  });

  it('includesToolResultsSection_whenToolResultsProvided', () => {
    const result = slotUserInput('', 'found 3 songs');
    expect(result).toContain('### Tool Results');
    expect(result).toContain('found 3 songs');
  });

  it('includesBothSections_whenBothProvided', () => {
    const result = slotUserInput('play jazz', 'jazz playlist found');
    expect(result).toContain('### Recent Input');
    expect(result).toContain('play jazz');
    expect(result).toContain('### Tool Results');
    expect(result).toContain('jazz playlist found');
  });
});

describe('slotMemory', () => {
  it('returnsEmpty_whenRepositoriesNull', () => {
    expect(slotMemory(null)).toBe('');
  });

  it('returnsEmpty_whenNoListenHistory', () => {
    expect(slotMemory({})).toBe('');
  });

  it('returnsEmpty_whenNoPlaysAndNoSeedPool', () => {
    const repos = {
      listenHistory: { history: () => [] },
      seedPool: { all: () => [] },
    };
    expect(slotMemory(repos)).toBe('');
  });

  it('includesRecentlyPlayed_whenPlaysExist', () => {
    const repos = {
      listenHistory: {
        history: () => [
          { title: 'Song A', artist: 'Artist A', playedAt: 1700000000000 },
        ],
      },
      seedPool: { all: () => [] },
    };
    const result = slotMemory(repos);
    expect(result).toContain('### Recently Played');
    expect(result).toContain('Song A');
    expect(result).toContain('Artist A');
  });

  it('includesTopArtists_whenProfileExists', () => {
    const repos = {
      listenHistory: {
        history: () => [
          { title: 'Song A', artist: 'Artist A', playedAt: 1700000000000 },
        ],
      },
      profile: { get: () => ({ topArtists: [{ name: 'Artist X', count: 5 }] }) },
      seedPool: { all: () => [] },
    };
    const result = slotMemory(repos);
    expect(result).toContain('### Top Artists');
    expect(result).toContain('Artist X');
    expect(result).toContain('5 plays');
  });

  it('includesSeedPoolInfo_whenSeedPoolExists', () => {
    const repos = {
      listenHistory: { history: () => [] },
      seedPool: { all: () => [{ id: '1' }, { id: '2' }] },
    };
    const result = slotMemory(repos);
    expect(result).toContain('### Taste Database');
    expect(result).toContain('2 songs');
  });
});

describe('slotEnvironment', () => {
  it('includesCurrentTime_andWeekday', () => {
    const result = slotEnvironment({});
    expect(result).toContain('Now:');
  });

  it('includesWeather_whenProvided', () => {
    const result = slotEnvironment({ weather: 'Sunny 25C' });
    expect(result).toContain('Weather: Sunny 25C');
  });

  it('includesCalendar_whenProvided', () => {
    const result = slotEnvironment({ calendar: 'Team meeting at 3pm' });
    expect(result).toContain('Calendar: Team meeting at 3pm');
  });

  it('includesMoodCategory_basedOnTimeOfDay', () => {
    // Test with a fixed date at 10am (morning)
    const result = slotEnvironment({}, new Date(2026, 6, 16, 10, 0));
    expect(result).toContain('mood=');
  });

  it('usesMorningMood_at10am', () => {
    const result = slotEnvironment({}, new Date(2026, 6, 16, 10, 0));
    expect(result).toMatch(/morning/);
  });

  it('usesAfternoonMood_at15pm', () => {
    const result = slotEnvironment({}, new Date(2026, 6, 16, 15, 0));
    expect(result).toMatch(/afternoon/);
  });

  it('usesEveningMood_at19pm', () => {
    const result = slotEnvironment({}, new Date(2026, 6, 16, 19, 0));
    expect(result).toMatch(/evening/);
  });

  it('usesNightMood_at2am', () => {
    const result = slotEnvironment({}, new Date(2026, 6, 16, 2, 0));
    expect(result).toMatch(/night/);
  });
});

describe('slotExecutionTrace', () => {
  it('returnsEmpty_whenNoTrace', () => {
    expect(slotExecutionTrace({})).toBe('');
  });

  it('includesLastAction_whenProvided', () => {
    const result = slotExecutionTrace({ lastAction: 'played Song A' });
    expect(result).toContain('Last action: played Song A');
  });

  it('includesQueueLength_whenProvided', () => {
    const result = slotExecutionTrace({ queueLength: 5 });
    expect(result).toContain('Queue: 5 songs');
  });

  it('includesMode_whenProvided', () => {
    const result = slotExecutionTrace({ mode: 'shuffle' });
    expect(result).toContain('Mode: shuffle');
  });
});

describe('assembleContextPrompt', () => {
  it('returnsOnlyEnvironment_whenNoOtherContent', () => {
    const result = assembleContextPrompt({});
    // Environment slot always has the current time, so result is never fully empty
    expect(result).toContain('<!-- ⑤ environment -->');
    expect(result).toContain('Now:');
    // Should not contain user-input or memory slots
    expect(result).not.toContain('③ user-input');
    expect(result).not.toContain('④ memory');
  });

  it('includesSlotLabels_whenContentExists', () => {
    const result = assembleContextPrompt({
      userInput: 'Hello',
      toolResults: '',
      environment: {},
      execTrace: {},
      corpus: null,
      repositories: null,
    });
    expect(result).toContain('<!-- ');
    expect(result).toContain('③ user-input+tools');
  });

  it('separatesSlotsWithDividers', () => {
    const result = assembleContextPrompt({
      userInput: 'Hello',
      environment: { weather: 'Sunny' },
    });
    expect(result).toContain('---');
  });
});
