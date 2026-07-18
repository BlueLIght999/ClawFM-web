import { describe, expect, it, vi } from 'vitest';
import { EVENTS } from '../socket/events.js';
import {
  emitQueueUpdate,
  emitRadioState,
  emitSongChange,
} from '../socket/versionedRadioEmitter.js';

const legacySong = { id: 1, name: 'Legacy', ar: [{ name: 'Artist' }], dt: 180000 };

describe('versioned radio emitter', () => {
  it('eventConstants_defineV1AndV2Names', () => {
    expect(EVENTS.RADIO_STATE).toBe('radio:state');
    expect(EVENTS.RADIO_STATE_V2).toBe('radio:state-v2');
    expect(EVENTS.SONG_CHANGE_V2).toBe('radio:song-change-v2');
    expect(EVENTS.QUEUE_UPDATE_V2).toBe('radio:queue-update-v2');
  });

  it('emitRadioState_sendsLegacyAndStableV2Payloads', () => {
    const target = { emit: vi.fn() };
    const state = { currentSong: legacySong, upcomingSongs: [legacySong], isPlaying: true };

    emitRadioState(target, state);

    expect(target.emit).toHaveBeenNthCalledWith(1, EVENTS.RADIO_STATE, state);
    expect(target.emit).toHaveBeenNthCalledWith(2, EVENTS.RADIO_STATE_V2, {
      schemaVersion: 2,
      currentSong: expect.not.objectContaining({ ar: expect.anything() }),
      upcomingSongs: [expect.not.objectContaining({ ar: expect.anything() })],
      isPlaying: true,
    });
  });

  it('emitSongChange_andQueueUpdate_sendBothProtocolVersions', () => {
    const target = { emit: vi.fn() };
    const songChange = { song: legacySong, startedAt: 123, audioUrl: null };
    const queueUpdate = { upcomingSongs: [legacySong], mode: 'fm' };

    emitSongChange(target, songChange);
    emitQueueUpdate(target, queueUpdate);

    expect(target.emit).toHaveBeenCalledWith(EVENTS.SONG_CHANGE, songChange);
    expect(target.emit).toHaveBeenCalledWith(EVENTS.SONG_CHANGE_V2, expect.objectContaining({ schemaVersion: 2 }));
    expect(target.emit).toHaveBeenCalledWith(EVENTS.QUEUE_UPDATE, queueUpdate);
    expect(target.emit).toHaveBeenCalledWith(EVENTS.QUEUE_UPDATE_V2, expect.objectContaining({ schemaVersion: 2 }));
  });
});
