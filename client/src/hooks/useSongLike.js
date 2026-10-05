/**
 * useSongLike — 正在播放那首歌的点赞入口（F4「成员点赞某歌 → 推给同簇其他人」）。
 *
 * 只有社区成员才给入口：服务端对非成员回 not_member，按钮露出来也只会失败。
 * 已赞态来自 CommunityContext.likedSongIds（服务端按歌幂等，这里只是不重复发请求）。
 */
import { useCallback } from 'react';
import { useCommunity } from '../contexts/CommunityContext.jsx';

/**
 * @param {{id?: string|number, title?: string, artist?: string}|null} song
 * @returns {{onLike: (() => void)|undefined, liked: boolean}}
 */
export function useSongLike(song) {
  const { currentMember, likedSongIds, likeSong } = useCommunity();
  const songId = song?.id !== undefined && song?.id !== null ? String(song.id) : '';
  const liked = Boolean(songId) && likedSongIds.includes(songId);
  const title = song?.title;
  const artist = song?.artist;

  const onLike = useCallback(() => {
    if (!songId || liked) return;
    likeSong({ songId, title, artist }).catch((e) => {
      console.warn('[community] like song failed:', e?.message);
    });
  }, [songId, liked, title, artist, likeSong]);

  return { onLike: currentMember ? onLike : undefined, liked };
}
