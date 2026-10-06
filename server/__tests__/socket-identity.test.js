import { describe, expect, it } from 'vitest';
import { resolveLoggedInUid } from '../socket/socketIdentity.js';

// socket 层「当前登录成员」的唯一解析口径：community:identify 的鉴权与聊天入口
// 注入给 agent 工具的可信调用者都走这里，两处若各写一份，迟早一处改了另一处没改。
describe('resolveLoggedInUid', () => {
  it('prefersTheUidStoredOnTheSocketAtLogin', () => {
    const socket = { data: { uid: 'u1' } };
    expect(resolveLoggedInUid(socket, { currentUid: () => 'u2' })).toBe('u1');
  });

  it('fallsBackToTheAuthRepositoryWhenTheSocketHasNone', () => {
    // 页面刷新 / socket 重连后 data 是空的，登录态仍在服务端
    expect(resolveLoggedInUid({ data: {} }, { currentUid: () => 'u2' })).toBe('u2');
    expect(resolveLoggedInUid({}, { currentUid: () => 42 })).toBe('42');
  });

  it('isNullWhenNobodyIsLoggedIn', () => {
    expect(resolveLoggedInUid({}, { currentUid: () => '' })).toBeNull();
    expect(resolveLoggedInUid({}, { currentUid: () => null })).toBeNull();
    expect(resolveLoggedInUid({}, undefined)).toBeNull();
    expect(resolveLoggedInUid(undefined, undefined)).toBeNull();
  });

  it('ignoresWhatTheClientClaimedAtIdentify', () => {
    // socket.data.userId 是 community:identify 时客户端自报、核对后才写入的；
    // 身份源头只能是服务端登录态，不能被它反过来顶替
    expect(resolveLoggedInUid({ data: { userId: 'evil' } }, { currentUid: () => null })).toBeNull();
  });
});
