/**
 * CommunityEventPublisher — 社区事件发布适配器（infrastructure）。
 *
 * 把 application 层 eventPublisher.emit(event, payload, targetUserId) 桥接到 Socket.IO：
 *   - targetUserId 非空 → 推到 room `user:<userId>`（成员在 communityHandler 里 join）
 *   - targetUserId 空 → 广播给所有客户端
 * 依赖倒置：application 只调 emit，不持有 io（守 D3/D4）。
 */
export function createCommunityEventPublisher({ io, logger } = {}) {
  return {
    emit(event, payload, targetUserId) {
      try {
        if (!io) return;
        if (targetUserId) {
          io.to?.(`user:${targetUserId}`).emit(event, payload);
        } else {
          io.emit?.(event, payload);
        }
      } catch (e) {
        logger?.warn?.({ component: 'community', err: e?.message, event }, 'community event emit failed');
      }
    },

    /**
     * 推送到一起听房间 room:<roomId>（F5 房主播放同步）。
     */
    emitToRoom(event, payload, roomId) {
      try {
        if (!io || !roomId) return;
        io.to?.(`room:${roomId}`).emit(event, payload);
      } catch (e) {
        logger?.warn?.({ component: 'community', err: e?.message, event, roomId }, 'room event emit failed');
      }
    },
  };
}
