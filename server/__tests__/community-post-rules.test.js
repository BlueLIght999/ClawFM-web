import { describe, expect, it } from 'vitest';
import {
  validatePost,
  sanitizeContent,
  POST_TYPES,
  MAX_CONTENT_LENGTH,
} from '../domain/community/postRules.js';

describe('community post rules', () => {
  it('validatePost_acceptsValidReflectionPost', () => {
    const result = validatePost({
      type: 'reflection',
      content: '  这首歌让我想起大学宿舍的夜晚  ',
    });
    expect(result.ok).toBe(true);
    expect(result.post.type).toBe('reflection');
    expect(result.post.content).toBe('这首歌让我想起大学宿舍的夜晚');
    expect(result.post.parentId).toBeNull();
    expect(result.post.songId).toBeNull();
    expect(result.post.playlistId).toBeNull();
  });

  it('validatePost_rejectsInvalidType', () => {
    const result = validatePost({ type: 'rant', content: 'x' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_type');
  });

  it('validatePost_rejectsEmptyContent', () => {
    const result = validatePost({ type: 'reflection', content: '   ' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('content_empty');
  });

  it('validatePost_rejectsNonStringContent', () => {
    const result = validatePost({ type: 'reflection', content: null });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('content_empty');
  });

  it('validatePost_rejectsTooLongContent', () => {
    const result = validatePost({ type: 'reflection', content: 'x'.repeat(MAX_CONTENT_LENGTH + 1) });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('content_too_long');
  });

  it('validatePost_acceptsMaxLengthContent', () => {
    const result = validatePost({ type: 'reflection', content: 'x'.repeat(MAX_CONTENT_LENGTH) });
    expect(result.ok).toBe(true);
  });

  it('validatePost_commentRequiresParentId', () => {
    const result = validatePost({ type: 'comment', content: '同感' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('comment_requires_parent');
  });

  it('validatePost_commentWithParentIdOk', () => {
    const result = validatePost({ type: 'comment', content: '同感', parentId: 42 });
    expect(result.ok).toBe(true);
    expect(result.post.parentId).toBe(42);
  });

  it('validatePost_recommendRequiresSongId', () => {
    const result = validatePost({ type: 'recommend', content: '推荐这首' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('recommend_requires_song');
  });

  it('validatePost_recommendWithSongIdOk', () => {
    const result = validatePost({ type: 'recommend', content: '推荐这首', songId: '123456' });
    expect(result.ok).toBe(true);
    expect(result.post.songId).toBe('123456');
  });

  it('validatePost_historyAcceptsOptionalPlaylistId', () => {
    const result = validatePost({
      type: 'history',
      content: '昨晚的听歌记录',
      playlistId: 'pl_99',
    });
    expect(result.ok).toBe(true);
    expect(result.post.playlistId).toBe('pl_99');
  });

  it('validatePost_handlesNullInput', () => {
    const result = validatePost(null);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_type');
  });

  it('sanitizeContent_trimsAndReturnsEmptyForNonString', () => {
    expect(sanitizeContent('  hi  ')).toBe('hi');
    expect(sanitizeContent(null)).toBe('');
    expect(sanitizeContent(undefined)).toBe('');
    expect(sanitizeContent(123)).toBe('');
  });

  it('POST_TYPES_containsExpectedTypes', () => {
    expect(POST_TYPES).toEqual(['reflection', 'history', 'recommend', 'comment']);
  });
});
