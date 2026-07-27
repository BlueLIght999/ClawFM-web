/**
 * roomRules — 一起听房间领域规则（F5，domain 纯逻辑）。
 *
 * 状态机：active → ended（终态）。房主权限：仅房主 + 房间 active 才能控制播放。
 * 主从同步：房主播放状态快照 → room:state/room:sync 广播给房内成员。
 * 纯函数，零 IO，遵循 D1/D2。
 */

export const ROOM_STATES = ['active', 'ended'];

const ROOM_TRANSITIONS = {
  active: ['ended'],
  ended: [],
};

export function canRoomTransition(from, to) {
  if (!ROOM_STATES.includes(from) || !ROOM_STATES.includes(to)) return false;
  return (ROOM_TRANSITIONS[from] || []).includes(to);
}

export function transitionRoom(room, toStatus) {
  const from = room?.status || 'active';
  if (!canRoomTransition(from, toStatus)) {
    return { ok: false, error: 'invalid_transition', from, to: toStatus };
  }
  return { ok: true, status: toStatus };
}

export function isHost(room, userId) {
  return !!room && String(room.hostUserId) === String(userId);
}

/**
 * 房间是否可被某用户控制（房主 + active）。
 */
export function canControl(room, userId) {
  return isHost(room, userId) && room?.status === 'active';
}

/**
 * 构建房主播放状态快照（room:state 广播用）。
 */
export function buildRoomStatePayload(state = {}) {
  const idx = Number(state.currentIndex);
  const pos = Number(state.position);
  return {
    isPlaying: !!state.isPlaying,
    currentSong: state.currentSong || null,
    currentIndex: Number.isFinite(idx) ? idx : 0,
    position: Number.isFinite(pos) ? pos : 0,
    playlistId: state.playlistId || null,
    updatedAt: Date.now(),
  };
}

/**
 * 规范化房间记录（补默认字段）。
 */
export function normalizeRoom(input) {
  const i = input || {};
  return {
    roomId: String(i.roomId || ''),
    hostUserId: String(i.hostUserId || ''),
    name: i.name || '',
    topicTags: Array.isArray(i.topicTags) ? i.topicTags : [],
    status: ROOM_STATES.includes(i.status) ? i.status : 'active',
  };
}
