/**
 * RoomService — 一起听房间用例（F5）。
 *
 * createRoom/joinRoom/hostControl（房主播放状态广播 room:state）/endRoom。
 * 主从同步：房主控制 → buildRoomStatePayload → emitToRoom('room:state') 给房内成员。
 * 依赖 CommunityRepository / domain roomRules / eventPublisher（emitToRoom）。
 */
import { randomUUID } from 'node:crypto';
import { canControl, buildRoomStatePayload, transitionRoom } from '../../domain/community/roomRules.js';

/**
 * @param {{communityRepository: import('../ports/repos/CommunityRepository.js').CommunityRepository, eventPublisher?: {emitToRoom?: (event:string, payload:object, roomId:string)=>void}, logger?: {warn?:Function}}} [deps]
 */
// The `= {}` default is cast rather than the dependency being marked optional:
// communityRepository is genuinely required (every method dereferences it), so
// typing it optional would trade one honest error for ~100 false
// possibly-undefined ones. A caller that omits it fails at first use -- which is
// the existing behaviour -- and the cast keeps that contract documented.
export function createRoomService({communityRepository, eventPublisher, logger} = /** @type {any} */ ({})) {
  const repo = communityRepository;

  function createRoom({ hostUserId, name, topicTags }) {
    if (!hostUserId) return { ok: false, error: 'host_required' };
    // roomId is a capability: knowing it is enough to join, and it is the room's
    // primary key. `Date.now() + Math.random()` is guessable and collides under
    // concurrent creation (same millisecond, 36^6 suffix); randomUUID removes both.
    const roomId = `room_${randomUUID()}`;
    const room = repo.createRoom({ roomId, hostUserId, name: name || '', topicTags: topicTags || [] });
    return { ok: true, room };
  }

  function getRoom(roomId) {
    return repo.getRoom(roomId);
  }

  /**
   * 列出房间。传 `true`/不传 → 仅活跃；传 `false` → 包含已结束。
   * 兼容旧 options 形式 `listRooms({ activeOnly: false })`。
   *
   * @param {boolean|{activeOnly?: boolean}} [activeOnlyOrOpts]
   *   Annotated because without a type the `typeof === 'boolean'` check narrows the
   *   untyped parameter down to the object branch, and a `null` argument then
   *   collapses to `never` on the property read (TS2339).
   */
  function listRooms(activeOnlyOrOpts = true) {
    const activeOnly = typeof activeOnlyOrOpts === 'boolean'
      ? activeOnlyOrOpts
      : activeOnlyOrOpts?.activeOnly !== false;
    return repo.listRooms(activeOnly);
  }

  function joinRoom(roomId, _userId) {
    const room = repo.getRoom(roomId);
    if (!room) return { ok: false, error: 'room_not_found' };
    if (room.status !== 'active') return { ok: false, error: 'room_ended' };
    return { ok: true, room };
  }

  /**
   * 房主播放控制（play/pause/skip/seek）→ 广播 room:state。
   * @returns {{ok:true, payload:object} | {ok:false, error:string}}
   */
  function hostControl(roomId, userId, state = {}) {
    const room = repo.getRoom(roomId);
    if (!room) return { ok: false, error: 'room_not_found' };
    if (!canControl(room, userId)) {
      logger?.warn?.({ component: 'community', roomId, userId }, 'room control denied');
      return { ok: false, error: 'not_host_or_inactive' };
    }
    const payload = buildRoomStatePayload(state);
    eventPublisher?.emitToRoom?.('room:state', payload, roomId);
    return { ok: true, payload };
  }

  function endRoom(roomId, userId) {
    const room = repo.getRoom(roomId);
    if (!room) return { ok: false, error: 'room_not_found' };
    if (!canControl(room, userId)) return { ok: false, error: 'not_host' };
    const t = transitionRoom(room, 'ended');
    if (!t.ok) return { ok: false, error: t.error };
    repo.endRoom(roomId);
    eventPublisher?.emitToRoom?.('room:state', { ended: true, roomId }, roomId);
    return { ok: true };
  }

  return { createRoom, getRoom, listRooms, joinRoom, hostControl, endRoom };
}
