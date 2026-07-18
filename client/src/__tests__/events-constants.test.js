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
});
