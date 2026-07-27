/**
 * RoomService — 一起听房间用例（F5）。
 *
 * createRoom/joinRoom/hostControl（房主播放状态广播 room:state）/endRoom。
 * 主从同步：房主控制 → buildRoomStatePayload → emitToRoom('room:state') 给房内成员。
 * 依赖 CommunityRepository / domain roomRules / eventPublisher（emitToRoom）。
 */
import { canControl, buildRoomStatePayload, transitionRoom } from '../../domain/community/roomRules.js';

/**
 * @param {object} deps
 * @param {import('../ports/repos/CommunityRepository.js').CommunityRepository} deps.communityRepository
 * @param {{emitToRoom?: (event:string, payload:object, roomId:string)=>void}} [deps.eventPublisher]
 * @param {{warn?:Function}} [deps.logger]
 */
export function createRoomService({ communityRepository, eventPublisher, logger } = {}) {
  const repo = communityRepository;

  function createRoom({ hostUserId, name, topicTags }) {
    if (!hostUserId) return { ok: false, error: 'host_required' };
    const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const room = repo.createRoom({ roomId, hostUserId, name: name || '', topicTags: topicTags || [] });
    return { ok: true, room };
  }

  function getRoom(roomId) {
    return repo.getRoom(roomId);
  }

  /**
   * 列出房间。传 `true`/不传 → 仅活跃；传 `false` → 包含已结束。
   * 兼容旧 options 形式 `listRooms({ activeOnly: false })`。
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
