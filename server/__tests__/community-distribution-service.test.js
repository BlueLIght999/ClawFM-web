import { describe, expect, it, beforeEach } from 'vitest';
import { createDistributionService } from '../application/services/DistributionService.js';

function makeMockRepo(clusters, dedupMap = {}) {
  const inbox = [];
  return {
    inbox,
    getClusterSnapshot: () => clusters,
    hasInboxRecently: (uid, type, id) => !!dedupMap[`${uid}:${type}:${id}`],
    createInbox: (entry) => { inbox.push(entry); return inbox.length; },
    listInbox: (userId) => inbox.filter((e) => e.userId === userId),
  };
}

function makeMockPublisher() {
  const emits = [];
  return { emits, emit: (event, payload, targetUserId) => { emits.push({ event, payload, targetUserId }); } };
}

let publisher;
beforeEach(() => { publisher = makeMockPublisher(); });

const clusters = [
  { clusterId: 0, label: 'rock·night', centroid: { genre_rock: 1, ts_night: 1 }, memberUserIds: ['a', 'b'], memberCount: 2 },
  { clusterId: 1, label: 'pop·happy', centroid: { genre_pop: 1, mood_happy: 1 }, memberUserIds: ['c'], memberCount: 1 },
];

describe('distribution service', () => {
  it('distribute_pushesToMatchedClusterMembers', () => {
    const repo = makeMockRepo(clusters);
    const service = createDistributionService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.distribute({ targetType: 'post', targetId: '1', contentTags: ['rock'] });
    expect(r.pushedTo).toBe(2);
    expect(r.matchedClusters.length).toBe(1);
    expect(r.matchedClusters[0].clusterId).toBe(0);
    expect(repo.inbox.length).toBe(2);
    expect(publisher.emits.length).toBe(2);
    expect(publisher.emits[0].event).toBe('community:push');
  });

  it('distribute_skipsDedupedRecipients', () => {
    const repo = makeMockRepo(clusters, { 'a:post:1': true });
    const service = createDistributionService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.distribute({ targetType: 'post', targetId: '1', contentTags: ['rock'] });
    expect(r.pushedTo).toBe(1); // only b
    expect(r.skipped).toBe(1);
    expect(repo.inbox.length).toBe(1);
    expect(repo.inbox[0].userId).toBe('b');
  });

  it('distribute_returnsZeroWhenNoMatch', () => {
    const repo = makeMockRepo(clusters);
    const service = createDistributionService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.distribute({ targetType: 'post', targetId: '2', contentTags: ['metal'] });
    expect(r.pushedTo).toBe(0);
    expect(r.matchedClusters).toEqual([]);
    expect(repo.inbox.length).toBe(0);
  });

  it('distribute_returnsZeroWhenNoClusters', () => {
    const repo = makeMockRepo([]);
    const service = createDistributionService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.distribute({ targetType: 'song', targetId: '9', contentTags: ['rock'] });
    expect(r.pushedTo).toBe(0);
  });

  it('distribute_storesFromClusterOnInbox', () => {
    const repo = makeMockRepo(clusters);
    const service = createDistributionService({ communityRepository: repo, eventPublisher: publisher });
    service.distribute({ targetType: 'playlist', targetId: 'pl1', contentTags: ['pop'], reason: 'taste match' });
    expect(repo.inbox.length).toBe(1);
    expect(repo.inbox[0].fromCluster).toBe(1);
    expect(repo.inbox[0].reason).toBe('taste match');
    expect(repo.inbox[0].userId).toBe('c');
  });

  it('distribute_neverPushesTheAuthorTheirOwnContent', () => {
    // 成员发帖后自己也在匹配簇里：把自己的帖推进自己的收件箱是噪音
    const repo = makeMockRepo(clusters);
    const service = createDistributionService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.distribute({ targetType: 'post', targetId: '1', contentTags: ['rock'], fromUserId: 'a' });
    expect(r.pushedTo).toBe(1);
    expect(repo.inbox.map((e) => e.userId)).toEqual(['b']);
    expect(publisher.emits.map((e) => e.targetUserId)).toEqual(['b']);
  });

  it('distribute_attributesAMemberInSeveralMatchedClustersToTheBestScoringOne', () => {
    // 同一成员可能出现在多个匹配簇（快照合并或历史数据）。fromCluster 取得分最高的那个，
    // 与此前逐个 find 的语义一致（matched 已按得分降序）
    const overlapping = [
      { clusterId: 7, label: 'rock', centroid: { genre_rock: 1 }, memberUserIds: ['x'] },
      { clusterId: 8, label: 'rock·pop', centroid: { genre_rock: 1, genre_pop: 1 }, memberUserIds: ['x'] },
    ];
    const repo = makeMockRepo(overlapping);
    const service = createDistributionService({ communityRepository: repo, eventPublisher: publisher });
    service.distribute({ targetType: 'post', targetId: '3', contentTags: ['rock', 'pop'] });
    expect(repo.inbox).toHaveLength(1);
    expect(repo.inbox[0].fromCluster).toBe(8);
  });

  it('getInbox_returnsUserInbox', () => {
    const repo = makeMockRepo(clusters);
    const service = createDistributionService({ communityRepository: repo, eventPublisher: publisher });
    service.distribute({ targetType: 'post', targetId: '1', contentTags: ['rock'] });
    const inbox = service.getInbox('a');
    expect(inbox.length).toBe(1);
    expect(inbox[0].targetId).toBe('1');
  });
});
