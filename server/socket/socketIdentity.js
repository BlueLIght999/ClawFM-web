/**
 * socketIdentity — socket 连接上「当前登录成员」的唯一解析口径。
 *
 * 优先 socket.data.uid（登录成功时由服务端写入），否则反查 authRepository
 * （页面刷新、socket 重连后 data 为空的恢复场景）。与 HTTP requireCommunityAuth
 * 同源：身份只来自服务端登录态，从不取客户端自报（socket.data.userId 是
 * community:identify 核对之后的产物，不是源头）或模型生成的值。
 */

/**
 * @param {{data?: {uid?: string|number}}|null|undefined} socket
 * @param {{currentUid?: () => string|number|null}|null|undefined} authRepository
 * @returns {string|null}
 */
export function resolveLoggedInUid(socket, authRepository) {
  const uid = socket?.data?.uid || authRepository?.currentUid?.();
  return uid ? String(uid) : null;
}
