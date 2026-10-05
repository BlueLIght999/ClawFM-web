import { describe, expect, it } from 'vitest';
import { buildMemberPersona } from '../domain/community/agentPersonaBuilder.js';
import {
  evaluateAgentAction,
  normalizeAgentRules,
  defaultAgentRules,
  AGENT_ACTIONS,
} from '../domain/community/memberAgentRules.js';

describe('community agent persona builder', () => {
  it('buildMemberPersona_includesNicknameAndTopPreferences', () => {
    const persona = buildMemberPersona(
      {
        tags: { genre: { rock: 0.7, pop: 0.3 }, mood: { energetic: 1 }, behavior: { night_owl: 1 }, region: {}, chat: {} },
        artistAffinity: [{ artist: 'Coldplay', weight: 0.9 }],
        userTags: [{ tag: '通勤', weight: 1 }, { tag: '失恋', weight: 1 }],
        timeSlot: {},
        meta: { totalPlays: 0, source: 'P-B' },
      },
      { nickname: '阿七' }
    );
    expect(persona).toContain('阿七');
    expect(persona).toContain('Coldplay');
    expect(persona).toContain('rock');
    expect(persona).toContain('energetic');
    expect(persona).toContain('night_owl');
    expect(persona).toContain('通勤、失恋'); // joined by 、
    expect(persona).toContain('署名');
  });

  it('buildMemberPersona_omitsMissingFieldsGracefully', () => {
    const persona = buildMemberPersona({}, {});
    expect(persona).toContain('个人 agent');
    expect(persona).not.toContain('偏爱歌手');
    expect(persona).not.toContain('曲风偏好');
  });

  it('buildMemberPersona_handlesNullProfile', () => {
    expect(() => buildMemberPersona(null)).not.toThrow();
    expect(() => buildMemberPersona(undefined, { nickname: 'x' })).not.toThrow();
  });
});

describe('community member agent rules', () => {
  it('defaultAgentRules_allowsCommentNotInvitable', () => {
    const r = defaultAgentRules();
    expect(r.canComment).toBe(true);
    expect(r.allowedTopics).toEqual([]);
    expect(r.canBeInvited).toBe(false);
    expect(r.sharePlaylists).toBe(false);
  });

  it('AGENT_ACTIONS_containsExpected', () => {
    expect(AGENT_ACTIONS).toEqual(['comment', 'be_invited', 'share_playlist']);
  });

  it('evaluateAgentAction_commentAllowedWhenCanCommentTrue', () => {
    expect(evaluateAgentAction({ rules: { canComment: true, allowedTopics: [] }, action: 'comment' })).toEqual({ allowed: true });
  });

  it('evaluateAgentAction_commentDisabled', () => {
    expect(evaluateAgentAction({ rules: { canComment: false, allowedTopics: [] }, action: 'comment' })).toEqual({ allowed: false, reason: 'comment_disabled' });
  });

  it('evaluateAgentAction_topicNotAllowed', () => {
    const r = evaluateAgentAction({ rules: { canComment: true, allowedTopics: ['rock', 'indie'] }, action: 'comment', topic: 'pop' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('topic_not_allowed');
  });

  it('evaluateAgentAction_topicAllowedWhenInList', () => {
    const r = evaluateAgentAction({ rules: { canComment: true, allowedTopics: ['rock'] }, action: 'comment', topic: 'rock' });
    expect(r.allowed).toBe(true);
  });

  it('evaluateAgentAction_topicMatchesThroughSynonymFolding', () => {
    // 帖子 autoTags 是归一键（'jazz'），成员在设置页写的是自己的写法（'爵士'）
    const r = evaluateAgentAction({ rules: { canComment: true, allowedTopics: ['爵士'] }, action: 'comment', topic: 'jazz' });
    expect(r.allowed).toBe(true);
    const denied = evaluateAgentAction({ rules: { canComment: true, allowedTopics: ['爵士'] }, action: 'comment', topic: 'rock' });
    expect(denied.allowed).toBe(false);
  });

  it('evaluateAgentAction_emptyTopicsAllowsAnyTopic', () => {
    const r = evaluateAgentAction({ rules: { canComment: true, allowedTopics: [] }, action: 'comment', topic: 'anything' });
    expect(r.allowed).toBe(true);
  });

  it('evaluateAgentAction_beInvited', () => {
    expect(evaluateAgentAction({ rules: { canBeInvited: true }, action: 'be_invited' })).toEqual({ allowed: true });
    expect(evaluateAgentAction({ rules: { canBeInvited: false }, action: 'be_invited' })).toEqual({ allowed: false, reason: 'not_invitable' });
  });

  it('evaluateAgentAction_sharePlaylist', () => {
    expect(evaluateAgentAction({ rules: { sharePlaylists: true }, action: 'share_playlist' })).toEqual({ allowed: true });
    expect(evaluateAgentAction({ rules: { sharePlaylists: false }, action: 'share_playlist' })).toEqual({ allowed: false, reason: 'sharing_disabled' });
  });

  it('evaluateAgentAction_unknownAction', () => {
    expect(evaluateAgentAction({ rules: {}, action: 'fly' })).toEqual({ allowed: false, reason: 'unknown_action' });
  });

  it('evaluateAgentAction_handlesNullArgs', () => {
    expect(() => evaluateAgentAction()).not.toThrow();
    expect(evaluateAgentAction({ action: 'comment' }).allowed).toBe(true); // 默认规则允许
  });

  it('normalizeAgentRules_fillsDefaultsAndFilters', () => {
    const n = normalizeAgentRules({ canComment: false, allowedTopics: ['rock', '', 5, 'indie'], canBeInvited: true, sharePlaylists: 'yes', extra: 'x' });
    expect(n.canComment).toBe(false);
    expect(n.allowedTopics).toEqual(['rock', 'indie']);
    expect(n.canBeInvited).toBe(true);
    expect(n.sharePlaylists).toBe(true);
    expect(n.extra).toBeUndefined();
  });

  it('normalizeAgentRules_handlesNull', () => {
    const n = normalizeAgentRules(null);
    expect(n.canComment).toBe(true);
    expect(n.allowedTopics).toEqual([]);
    expect(n.canBeInvited).toBe(false);
  });
});
