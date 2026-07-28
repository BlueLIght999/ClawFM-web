import { describe, it, expect } from 'vitest';
import { E } from '../constants/events.js';

describe('Event Constants', () => {
  it('exportsRadioState', () => {
    expect(E.RADIO_STATE).toBe('radio:state-v2');
  });

  it('exportsSongChange', () => {
    expect(E.SONG_CHANGE).toBe('radio:song-change-v2');
  });

  it('exportsDjMessage', () => {
    expect(E.DJ_MESSAGE).toBe('radio:dj-message');
  });

  it('exportsDjSpeechStart', () => {
    expect(E.DJ_SPEECH_START).toBe('radio:dj-speech-start');
  });

  it('exportsDjSpeechEnd', () => {
    expect(E.DJ_SPEECH_END).toBe('radio:dj-speech-end');
  });

  it('exportsQueueUpdate', () => {
    expect(E.QUEUE_UPDATE).toBe('radio:queue-update-v2');
  });

  it('exportsCrabAnimation', () => {
    expect(E.CRAB_ANIMATION).toBe('crab:animation');
  });

  it('exportsCrabBubbles', () => {
    expect(E.CRAB_BUBBLES).toBe('crab:bubbles');
  });

  it('exportsCrabBubbleClick', () => {
    expect(E.CRAB_BUBBLE_CLICK).toBe('crab:bubble-click');
  });

  it('exportsPlanUpdate', () => {
    expect(E.PLAN_UPDATE).toBe('plan:update');
  });

  it('exportsSyncTime', () => {
    expect(E.SYNC_TIME).toBe('sync:time');
  });

  it('exportsLoginRequired', () => {
    expect(E.LOGIN_REQUIRED).toBe('radio:login-required');
  });

  it('exportsError', () => {
    expect(E.ERROR).toBe('radio:error');
  });

  it('exportsPause', () => {
    expect(E.PAUSE).toBe('radio:pause');
  });

  it('exportsResume', () => {
    expect(E.RESUME).toBe('radio:resume');
  });

  it('exportsPlaybackPosition', () => {
    expect(E.PLAYBACK_POSITION).toBe('radio:playback-position');
  });

  it('exportsDjStreamChunk', () => {
    expect(E.DJ_STREAM_CHUNK).toBe('radio:dj-stream-chunk');
  });

  it('exportsDjStreamEnd', () => {
    expect(E.DJ_STREAM_END).toBe('radio:dj-stream-end');
  });

  // ── Community module events (PRD v0.3) ──
  it('exportsCommunityPush', () => {
    expect(E.COMMUNITY_PUSH).toBe('community:push');
  });

  it('exportsCommunityClusterUpdated', () => {
    expect(E.COMMUNITY_CLUSTER_UPDATED).toBe('community:cluster-updated');
  });

  it('exportsCommunityPostNew', () => {
    expect(E.COMMUNITY_POST_NEW).toBe('community:post-new');
  });

  it('exportsCommunityAgentComment', () => {
    expect(E.COMMUNITY_AGENT_COMMENT).toBe('community:agent-comment');
  });

  it('exportsCommunityInvitation', () => {
    expect(E.COMMUNITY_INVITATION).toBe('community:invitation');
  });

  it('exportsRoomState', () => {
    expect(E.ROOM_STATE).toBe('room:state');
  });

  it('exportsRoomChat', () => {
    expect(E.ROOM_CHAT).toBe('room:chat');
  });

  it('exportsRoomSync', () => {
    expect(E.ROOM_SYNC).toBe('room:sync');
  });

  it('exportsCommunityIdentify', () => {
    expect(E.COMMUNITY_IDENTIFY).toBe('community:identify');
  });

  it('exportsRoomJoin', () => {
    expect(E.ROOM_JOIN).toBe('room:join');
  });

  it('exportsRoomLeave', () => {
    expect(E.ROOM_LEAVE).toBe('room:leave');
  });

  it('exportsRoomSkip', () => {
    expect(E.ROOM_SKIP).toBe('room:skip');
  });
});
