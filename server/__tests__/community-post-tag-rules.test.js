import { describe, expect, it } from 'vitest';
import { extractPostTags, POST_TAG_LIMIT } from '../domain/community/postTagRules.js';
import { normalizeTagKey } from '../domain/community/tagRecall.js';
import { GENRE_TAGS, MOOD_TAGS } from '../domain/community/profileFusionRules.js';

describe('extractPostTags', () => {
  it('extracts canonical genre keys from Chinese text', () => {
    // 输出必须是归一键：画像侧与召回侧都按归一键判等，原样写法对不上
    expect(extractPostTags('今晚循环后摇，配一点爵士')).toEqual(['postrock', 'jazz']);
  });

  it('extracts mood keys that line up with the profile mood vocabulary', () => {
    expect(extractPostTags('这首歌好治愈，有点怀旧')).toEqual(['calm', 'nostalgic']);
  });

  it('orders tags by first occurrence so the result is deterministic', () => {
    expect(extractPostTags('爵士之后是后摇')).toEqual(['jazz', 'postrock']);
    expect(extractPostTags('后摇之后是爵士')).toEqual(['postrock', 'jazz']);
  });

  it('dedupes synonyms that fold into the same key', () => {
    expect(extractPostTags('爵士 Jazz 爵士乐')).toEqual(['jazz']);
  });

  it('caps the result at the PRD limit of 3', () => {
    expect(POST_TAG_LIMIT).toBe(3);
    expect(extractPostTags('摇滚 民谣 爵士 古典 说唱')).toHaveLength(3);
  });

  it('matches ASCII terms only on word boundaries', () => {
    // 'pop' 不能从 'popcorn' 里被认出来，'rap' 不能从 'grape' 里被认出来
    expect(extractPostTags('popcorn and grape juice')).toEqual([]);
    expect(extractPostTags('Some POP, some rap.')).toEqual(['pop', 'hiphop']);
  });

  it('returns an empty list for text without any known term', () => {
    expect(extractPostTags('今天天气不错')).toEqual([]);
    expect(extractPostTags('')).toEqual([]);
    expect(extractPostTags(null)).toEqual([]);
    expect(extractPostTags(42)).toEqual([]);
  });

  it('reads raw text, so a term with & is still recognised', () => {
    // 调用方应传未转义的原文：sanitizeContent 会把 & 变成 &amp;
    expect(extractPostTags('深夜听 R&B')).toEqual(['rnb']);
  });

  it('only emits keys that are fixed points of normalizeTagKey', () => {
    const text = '流行 摇滚 民谣 电子 说唱 爵士 古典 节奏布鲁斯 金属 独立 开心 伤感 治愈 怀旧 浪漫';
    for (const key of extractPostTags(text, { limit: 99 })) {
      expect(normalizeTagKey(key)).toBe(key);
    }
  });

  it('covers every profile genre and mood key with at least one surface form', () => {
    // 画像里的每个曲风/情绪键都要能从帖子里被认出来，否则 F9 加权对这类帖子恒为 0
    const all = [...GENRE_TAGS, ...MOOD_TAGS];
    const found = new Set(extractPostTags(all.join(' '), { limit: 99 }));
    for (const key of all) expect(found.has(key)).toBe(true);
  });
});
