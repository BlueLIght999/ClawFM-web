import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSongLike } from '../hooks/useSongLike.js';

const ctx = {
  currentMember: { userId: 'u1' },
  likedSongIds: [],
  likeSong: vi.fn(),
};

vi.mock('../contexts/CommunityContext.jsx', () => ({
  useCommunity: () => ctx,
}));

const song = { id: 9, title: '晴天', artist: '周杰伦' };

describe('useSongLike', () => {
  beforeEach(() => {
    ctx.currentMember = { userId: 'u1' };
    ctx.likedSongIds = [];
    ctx.likeSong = vi.fn().mockResolvedValue({ liked: true, alreadyLiked: false });
  });

  it('点赞把当前歌的 id/歌名/歌手交给 likeSong', async () => {
    const { result } = renderHook(() => useSongLike(song));
    await act(async () => { result.current.onLike(); });
    expect(ctx.likeSong).toHaveBeenCalledWith({ songId: '9', title: '晴天', artist: '周杰伦' });
  });

  it('已赞过的歌显示已赞，再点不重复请求', async () => {
    ctx.likedSongIds = ['9'];
    const { result } = renderHook(() => useSongLike(song));
    expect(result.current.liked).toBe(true);
    await act(async () => { result.current.onLike(); });
    expect(ctx.likeSong).not.toHaveBeenCalled();
  });

  it('不是社区成员时不给入口', () => {
    ctx.currentMember = null;
    const { result } = renderHook(() => useSongLike(song));
    expect(result.current.onLike).toBeUndefined();
  });

  it('请求失败不抛到渲染层', async () => {
    ctx.likeSong = vi.fn().mockRejectedValue(new Error('not_member'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useSongLike(song));
    await act(async () => { result.current.onLike(); });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
