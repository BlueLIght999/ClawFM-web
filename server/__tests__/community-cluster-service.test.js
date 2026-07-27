import { describe, expect, it, beforeEach } from 'vitest';
import { createClusterService } from '../application/services/ClusterService.js';

function makeProfile(genre) {
  return {
    tags: { genre: { [genre]: 1 }, mood: {}, region: {}, behavior: {}, chat: {} },
    artistAffinity: [],
    timeSlot: {},
    userTags: [],
    meta: { totalPlays: 0, source: 'P-B' },
  };
}

function makeMockRepo(profiles) {
  const calls = { saveSnapshot: [], setMember: [] };
  let snapshot = [];
  return {
    calls,
    listAllProfiles: () => profiles,
    saveClusterSnapshot: (clusters) => { calls.saveSnapshot.push(clusters); snapshot = clusters; },
    getClusterSnapshot: () => snapshot,
    setMemberCluster: (uid, cid) => { calls.setMember.push([uid, cid]); },
  };
}

function makeMockPublisher() {
  const emits = [];
  return { emits, emit: (event, payload, targetUserId) => { emits.push({ event, payload, targetUserId }); } };
}

let publisher;
beforeEach(() => { publisher = makeMockPublisher(); });

describe('cluster service', () => {
  it('runClustering_orchestratesPersistsAndEmits', () => {
    const profiles = [
      { userId: 'r1', profile: makeProfile('rock') },
      { userId: 'r2', profile: makeProfile('rock') },
      { userId: 'p1', profile: makeProfile('pop') },
      { userId: 'p2', profile: makeProfile('pop') },
    ];
    const repo = makeMockRepo(profiles);
    const service = createClusterService({ communityRepository: repo, eventPublisher: publisher });

    const result = service.runClustering();

    expect(result.degraded).toBe(false);
    expect(result.clusters.length).toBeGreaterThanOrEqual(1);
    // snapshot saved
    expect(repo.calls.saveSnapshot.length).toBe(1);
    expect(repo.calls.saveSnapshot[0].length).toBe(result.clusters.length);
    // every member assigned
    expect(repo.calls.setMember.length).toBe(4);
    // emit per member
    expect(publisher.emits.length).toBe(4);
    expect(publisher.emits[0].event).toBe('community:cluster-updated');
  });

  it('runClustering_emptyProfilesReturnsZero', () => {
    const repo = makeMockRepo([]);
    const service = createClusterService({ communityRepository: repo, eventPublisher: publisher });
    const result = service.runClustering();
    expect(result.k).toBe(0);
    expect(result.clusters).toEqual([]);
    expect(result.degraded).toBe(false);
    expect(repo.calls.saveSnapshot.length).toBe(0);
    expect(publisher.emits.length).toBe(0);
  });

  it('runClustering_degradesWhenListAllProfilesThrows', () => {
    const repo = {
      listAllProfiles: () => { throw new Error('db down'); },
      getClusterSnapshot: () => [{ clusterId: 0, label: 'old', centroid: {}, memberUserIds: ['x'], memberCount: 1 }],
    };
    const service = createClusterService({ communityRepository: repo, eventPublisher: publisher });
    const result = service.runClustering();
    expect(result.degraded).toBe(true);
    expect(result.k).toBe(0);
  });

  it('getClusters_returnsRepositorySnapshot', () => {
    const repo = makeMockRepo([]);
    const service = createClusterService({ communityRepository: repo, eventPublisher: publisher });
    expect(service.getClusters()).toEqual([]);
  });
});
