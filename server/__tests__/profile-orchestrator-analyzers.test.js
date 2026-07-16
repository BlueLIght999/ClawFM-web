import { describe, it, expect, vi } from 'vitest';
import { ProfileOrchestrator } from '../domain/profile/ProfileOrchestrator.js';

describe('ProfileOrchestrator analyzer integration', () => {
  it('constructor_createsAllSixAnalyzers', () => {
    const orch = new ProfileOrchestrator({});
    expect(orch.analyzers).toBeDefined();
    expect(orch.analyzers.chatStyle).toBeDefined();
    expect(orch.analyzers.emotion).toBeDefined();
    expect(orch.analyzers.dailyHabit).toBeDefined();
    expect(orch.analyzers.userCluster).toBeDefined();
    expect(orch.analyzers.recommendation).toBeDefined();
    expect(orch.analyzers.agentContext).toBeDefined();
  });

  it('runAnalysis_returnsNullWhenNoProfile', async () => {
    const orch = new ProfileOrchestrator({ repositories: {} });
    const result = await orch.runAnalysis();
    expect(result).toBeNull();
  });

  it('runAnalysis_runsAllAnalyzersOnProfile', async () => {
    const orch = new ProfileOrchestrator({ repositories: {} });
    // Manually set a profile
    orch._currentProfile = {
      tags: {
        genre: { pop: { weight: 0.8, evidenceCount: 5 } },
        mood: { happy: { weight: 0.6, evidenceCount: 3 } },
      },
      schemaVersion: 1,
    };
    const result = await orch.runAnalysis({
      chat: [{ role: 'user', content: '你好' }],
      listen: [{ songId: '1', title: 'Song', artist: 'Artist', playedAt: '2026-01-01T10:00:00Z' }],
      time: [],
    });
    expect(result).toBeDefined();
    expect(result.chatStyle).toBeDefined();
    expect(result.emotion).toBeDefined();
    expect(result.dailyHabit).toBeDefined();
    expect(result.userCluster).toBeDefined();
    expect(result.agentContext).toBeDefined();
  });

  it('runAnalysis_analyzerFailure_doesNotBreakOthers', async () => {
    const orch = new ProfileOrchestrator({ repositories: {} });
    orch._currentProfile = { tags: {}, schemaVersion: 1 };
    // Replace one analyzer with a failing one
    orch.analyzers.chatStyle = {
      name: 'FailingAnalyzer',
      analyze: vi.fn().mockRejectedValue(new Error('boom')),
      emit: vi.fn(),
    };
    const result = await orch.runAnalysis({});
    expect(result.chatStyle).toBeUndefined();
    expect(result.emotion).toBeDefined();
  });

  it('getPortImplementation_includesEnhanceSongsAndGetAgentContext', () => {
    const orch = new ProfileOrchestrator({});
    const port = orch.getPortImplementation();
    expect(typeof port.enhanceSongs).toBe('function');
    expect(typeof port.getAgentContext).toBe('function');
    expect(typeof port.triggerAnalysis).toBe('function');
  });

  it('getPortImplementation_enhanceSongs_returnsSongsWhenNoProfile', () => {
    const orch = new ProfileOrchestrator({});
    const port = orch.getPortImplementation();
    const songs = [{ title: 'Test', artist: 'Artist' }];
    const result = port.enhanceSongs(songs);
    expect(result).toEqual(songs);
  });

  it('getPortImplementation_triggerAnalysis_delegatesToRunAnalysis', async () => {
    const orch = new ProfileOrchestrator({ repositories: {} });
    const spy = vi.spyOn(orch, 'runAnalysis').mockResolvedValue({ test: true });
    const port = orch.getPortImplementation();
    await port.triggerAnalysis({ chat: [] });
    expect(spy).toHaveBeenCalledWith({ chat: [] });
  });
});
