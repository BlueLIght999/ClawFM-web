import { describe, expect, it } from 'vitest';
import {
  ROOM_STATES,
  canRoomTransition,
  transitionRoom,
  isHost,
  canControl,
  buildRoomStatePayload,
  normalizeRoom,
} from '../domain/community/roomRules.js';
import {
  topTasteKeywords,
  scorePostForTaste,
  personalizeFeed,
} from '../domain/community/feedPersonalizationRules.js';

describe('community room rules', () => {
  it('ROOM_STATES_containsExpected', () => {
    expect(ROOM_STATES).toEqual(['active', 'ended']);
  });

  it('canRoomTransition_allowsActiveToEnd', () => {
    expect(canRoomTransition('active', 'ended')).toBe(true);
  });

  it('canRoomTransition_rejectsInvalid', () => {
    expect(canRoomTransition('active', 'active')).toBe(false);
    expect(canRoomTransition('ended', 'active')).toBe(false);
    expect(canRoomTransition('bogus', 'ended')).toBe(false);
  });

  it('transitionRoom_appliesValid', () => {
    expect(transitionRoom({ status: 'active' }, 'ended')).toEqual({ ok: true, status: 'ended' });
  });

  it('transitionRoom_rejectsInvalid', () => {
    const r = transitionRoom({ status: 'ended' }, 'active');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_transition');
  });

  it('isHost_matchesByUserId', () => {
    expect(isHost({ hostUserId: 'u1' }, 'u1')).toBe(true);
    expect(isHost({ hostUserId: 'u1' }, 'u2')).toBe(false);
    expect(isHost(null, 'u1')).toBe(false);
  });

  it('canControl_requiresHostAndActive', () => {
    expect(canControl({ hostUserId: 'u1', status: 'active' }, 'u1')).toBe(true);
    expect(canControl({ hostUserId: 'u1', status: 'ended' }, 'u1')).toBe(false);
    expect(canControl({ hostUserId: 'u1', status: 'active' }, 'u2')).toBe(false);
  });

  it('buildRoomStatePayload_normalizesFields', () => {
    const payload = buildRoomStatePayload({ isPlaying: 1, currentSong: { id: 's1' }, currentIndex: '2', position: '5.5', playlistId: 'pl1' });
    expect(payload.isPlaying).toBe(true);
    expect(payload.currentIndex).toBe(2);
    expect(payload.position).toBe(5.5);
    expect(payload.playlistId).toBe('pl1');
    expect(payload.updatedAt).toBeGreaterThan(0);
  });

  it('buildRoomStatePayload_handlesEmpty', () => {
    const p = buildRoomStatePayload();
    expect(p.isPlaying).toBe(false);
    expect(p.currentSong).toBeNull();
    expect(p.currentIndex).toBe(0);
  });

  it('normalizeRoom_fillsDefaults', () => {
    const r = normalizeRoom({ roomId: 'r1', hostUserId: 'u1', name: '夜猫房', topicTags: ['rock'] });
    expect(r.status).toBe('active');
    expect(r.topicTags).toEqual(['rock']);
  });

  it('normalizeRoom_clampsStatus', () => {
    expect(normalizeRoom({ status: 'bogus' }).status).toBe('active');
    expect(normalizeRoom({ status: 'ended' }).status).toBe('ended');
  });
});

describe('community feed personalization rules', () => {
  function makeProfile({ genre = {}, artist, userTags = [] } = {}) {
    return {
      tags: { genre, mood: {}, region: {}, behavior: {}, chat: {} },
      artistAffinity: artist ? [{ artist, weight: 0.9 }] : [],
      timeSlot: {},
      userTags: userTags.map((t) => ({ tag: t, weight: 1 })),
      meta: { totalPlays: 0, source: 'P-B' },
    };
  }

  it('topTasteKeywords_extractsTopWeighted', () => {
    const kw = topTasteKeywords(makeProfile({ genre: { rock: 0.7, pop: 0.3 }, artist: 'Coldplay', userTags: ['通勤'] }));
    expect(kw).toContain('rock');
    expect(kw).toContain('coldplay');
    expect(kw).toContain('通勤');
    expect(kw[0]).toBe('通勤'); // 自填标签 weight 1.0 最高，其次 coldplay 0.9、rock 0.7
  });

  it('topTasteKeywords_respectsN', () => {
    const kw = topTasteKeywords(makeProfile({ genre: { rock: 1, pop: 1, jazz: 1, folk: 1, metal: 1, indie: 1 } }), 3);
    expect(kw.length).toBe(3);
  });

  it('topTasteKeywords_emptyProfile', () => {
    expect(topTasteKeywords({})).toEqual([]);
    expect(topTasteKeywords(null)).toEqual([]);
  });

  it('scorePostForTaste_countsOverlap', () => {
    expect(scorePostForTaste({ autoTags: ['rock', 'night'] }, ['rock', 'pop'])).toBe(1);
    expect(scorePostForTaste({ autoTags: ['rock', 'pop'] }, ['rock', 'pop'])).toBe(2);
    expect(scorePostForTaste({ autoTags: [] }, ['rock'])).toBe(0);
    expect(scorePostForTaste({}, ['rock'])).toBe(0);
  });

  it('personalizeFeed_boostsMatchingPostsStably', () => {
    const posts = [
      { id: 1, autoTags: ['pop'] },
      { id: 2, autoTags: ['rock'] },
      { id: 3, autoTags: ['jazz'] },
    ];
    const result = personalizeFeed(posts, [makeProfile({ genre: { rock: 1 } })]);
    expect(result[0].id).toBe(2); // rock 帖排前
    // 其余保持原序
    expect(result[1].id).toBe(1);
    expect(result[2].id).toBe(3);
  });

  it('personalizeFeed_matchesSelfTagsThroughSynonymFolding', () => {
    // 被邀请方自填「后摇」，帖子归一标签是 'postrock'：判等必须与召回层同源（normalizeTagKey）
    const posts = [{ id: 1, autoTags: ['pop'] }, { id: 2, autoTags: ['postrock'] }];
    const invitee = { tags: {}, userTags: [{ tag: '后摇', weight: 1 }] };
    expect(personalizeFeed(posts, [invitee]).map((p) => p.id)).toEqual([2, 1]);
  });

  it('scorePostForTaste_foldsBothSides', () => {
    expect(scorePostForTaste({ autoTags: ['爵士'] }, ['Jazz'])).toBe(1);
  });

  it('personalizeFeed_noProfilesReturnsOriginalOrder', () => {
    const posts = [{ id: 1 }, { id: 2 }];
    expect(personalizeFeed(posts, []).map((p) => p.id)).toEqual([1, 2]);
  });

  it('personalizeFeed_emptyPosts', () => {
    expect(personalizeFeed([], [makeProfile()])).toEqual([]);
  });

  it('personalizeFeed_doesNotMutateInput', () => {
    const posts = [{ id: 1, autoTags: ['pop'] }, { id: 2, autoTags: ['rock'] }];
    const snapshot = posts.map((p) => p.id);
    personalizeFeed(posts, [makeProfile({ genre: { rock: 1 } })]);
    expect(posts.map((p) => p.id)).toEqual(snapshot);
  });

  it('personalizeFeed_mergesMultipleInviteeProfiles', () => {
    const posts = [{ id: 1, autoTags: ['rock'] }, { id: 2, autoTags: ['jazz'] }];
    const result = personalizeFeed(posts, [
      makeProfile({ genre: { rock: 1 } }),
      makeProfile({ genre: { jazz: 1 } }),
    ]);
    // 两个都匹配分1，保持原序
    expect(result.map((p) => p.id)).toEqual([1, 2]);
  });
});
