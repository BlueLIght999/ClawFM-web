/**
 * communityHandler — 社区 Socket 事件处理（F5 一起听房间 + 成员身份绑定）。
 *
 * community:identify 绑定 socket 到 `user:<uid>` room（供定向推送）+ 记 socket.data.userId。
 * 鉴权：自报 userId 须与当前网易云登录 uid 一致（socket.data.uid 或 authRepository.currentUid()）。
 * room:join/leave/chat 房间基础；room:skip 房主切歌→RoomService.hostControl 广播 room:state。
 */
import { EVENTS } from './events.js';

export function createCommunityHandler({ io, roomService, authRepository, logger } = {}) {
  return {
    /**
     * 在新连接上注册社区事件监听。
     * @param {import('socket.io').Socket} socket
     */
    register(socket) {
      socket.on(EVENTS.COMMUNITY_IDENTIFY, (userId) => {
        if (!userId) return;
        // 鉴权：自报 userId 须与当前网易云登录态一致
        // 优先用 socket.data.uid（登录成功时已存），否则从 authRepository 反查（页面刷新恢复场景）
        const loggedInUid = socket.data?.uid || authRepository?.currentUid?.() || '';
        if (!loggedInUid || String(userId) !== String(loggedInUid)) {
          socket.emit('community:error', { error: 'auth_required', reason: 'userId mismatch with logged-in uid' });
          logger?.warn?.({ component: 'community', socketId: socket.id, claimed: userId, actual: loggedInUid }, 'community identify rejected');
          return;
        }
        socket.data = socket.data || {};
        socket.data.userId = String(userId);
        socket.join(`user:${userId}`);
        logger?.info?.({ component: 'community', socketId: socket.id, userId }, 'member identified');
      });

      // ── 一起听房间 ──
      socket.on(EVENTS.ROOM_JOIN, ({ roomId } = {}) => {
        if (roomId) socket.join(`room:${roomId}`);
      });
      socket.on(EVENTS.ROOM_LEAVE, ({ roomId } = {}) => {
        if (roomId) socket.leave(`room:${roomId}`);
      });
      socket.on(EVENTS.ROOM_CHAT, ({ roomId, message } = {}) => {
        if (roomId && message) {
          io?.to?.(`room:${roomId}`).emit(EVENTS.ROOM_CHAT, { roomId, message, from: socket.data?.userId || socket.id });
        }
      });
      // 房主切歌 → hostControl 广播 room:state
      socket.on(EVENTS.ROOM_SKIP, ({ roomId } = {}) => {
        if (!roomId || !roomService) return;
        const userId = socket.data?.userId;
        if (!userId) return;
        const r = roomService.hostControl(roomId, userId, { skip: true, isPlaying: true });
        if (!r.ok) {
          socket.emit('community:error', { roomId, error: r.error });
        }
      });
    },
  };
}
