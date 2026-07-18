import { EVENTS } from './events.js';
import {
  projectQueueUpdateV2,
  projectRadioStateV2,
  projectSongChangeV2,
} from '../domain/curation/radioEventV2.js';

function emitBoth(target, legacyEvent, v2Event, payload, projector) {
  target.emit(legacyEvent, payload);
  target.emit(v2Event, projector(payload));
}

/** Emit v1 radio state for compatibility and v2 state for stable-Song clients. */
export function emitRadioState(target, payload) {
  emitBoth(target, EVENTS.RADIO_STATE, EVENTS.RADIO_STATE_V2, payload, projectRadioStateV2);
}

/** Emit v1 song change for compatibility and v2 change without NetEase fields. */
export function emitSongChange(target, payload) {
  emitBoth(target, EVENTS.SONG_CHANGE, EVENTS.SONG_CHANGE_V2, payload, projectSongChangeV2);
}

/** Emit v1 queue update for compatibility and v2 queue with stable Song DTOs. */
export function emitQueueUpdate(target, payload) {
  emitBoth(target, EVENTS.QUEUE_UPDATE, EVENTS.QUEUE_UPDATE_V2, payload, projectQueueUpdateV2);
}

/**
 * Binds versioned radio event methods to one Socket.IO target.
 * @param {{emit: Function}} target Socket.IO server or individual socket.
 * @returns {{emitRadioState: Function, emitSongChange: Function, emitQueueUpdate: Function}} Bound emitter facade.
 * @throws Propagates target.emit failures to the interface caller.
 * Constraint: callers must pass the same payload they previously sent to v1 clients.
 */
export function createVersionedRadioEmitter(target) {
  return {
    emitRadioState: payload => emitRadioState(target, payload),
    emitSongChange: payload => emitSongChange(target, payload),
    emitQueueUpdate: payload => emitQueueUpdate(target, payload),
  };
}
