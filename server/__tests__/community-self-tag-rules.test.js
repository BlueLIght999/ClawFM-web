import { describe, expect, it } from 'vitest';
import {
  MAX_SELF_TAGS,
  MAX_TAG_LENGTH,
  SELF_TAG_ERRORS,
  normalizeTagList,
  tagJaccard,
  validateSelfTags,
} from '../domain/community/selfTagRules.js';

describe('selfTagRules', () => {
  describe('normalizeTagList', () => {
    it('normalizeTagList_trimsAndDropsEmpty', () => {
      expect(normalizeTagList(['  后摇 ', '', '   ', '爵士'])).toEqual(['后摇', '爵士']);
    });

    it('normalizeTagList_dedupesCaseInsensitively_keepsFirstSpelling', () => {
      // 用户先写 Rock 又写 rock，应只留首次书写形式供前端稳定回显
      expect(normalizeTagList(['Rock', 'rock', 'ROCK'])).toEqual(['Rock']);
    });

    it('normalizeTagList_dropsNonStringEntries', () => {
      expect(normalizeTagList(['后摇', 42, null, undefined, {}, '爵士'])).toEqual(['后摇', '爵士']);
    });

    it('normalizeTagList_nonArrayReturnsEmpty', () => {
      expect(normalizeTagList('后摇')).toEqual([]);
      expect(normalizeTagList(null)).toEqual([]);
      expect(normalizeTagList(undefined)).toEqual([]);
    });

    it('normalizeTagList_doesNotMutateInput', () => {
      const input = [' 后摇 ', '后摇'];
      normalizeTagList(input);
      expect(input).toEqual([' 后摇 ', '后摇']);
    });
  });

  describe('validateSelfTags', () => {
    it('validateSelfTags_validList_returnsNormalized', () => {
      const result = validateSelfTags([' 后摇 ', '爵士小号']);
      expect(result).toEqual({ ok: true, tags: ['后摇', '爵士小号'] });
    });

    it('validateSelfTags_emptyArray_isValid', () => {
      // 清空标签是合法操作（用户想删掉全部自填标签）
      expect(validateSelfTags([])).toEqual({ ok: true, tags: [] });
    });

    it('validateSelfTags_nonArrayRejected', () => {
      // 字段名写错时必须报错，而非静默当空列表返回 200
      expect(validateSelfTags(undefined)).toEqual({ ok: false, error: SELF_TAG_ERRORS.NOT_ARRAY });
      expect(validateSelfTags('后摇')).toEqual({ ok: false, error: SELF_TAG_ERRORS.NOT_ARRAY });
    });

    it('validateSelfTags_nonStringEntryRejected', () => {
      expect(validateSelfTags(['后摇', 42])).toEqual({ ok: false, error: SELF_TAG_ERRORS.INVALID_ENTRY });
    });

    it('validateSelfTags_tagAtLengthLimit_isAccepted', () => {
      const tag = 'x'.repeat(MAX_TAG_LENGTH);
      expect(validateSelfTags([tag])).toEqual({ ok: true, tags: [tag] });
    });

    it('validateSelfTags_tagOverLengthLimit_rejected', () => {
      const tag = 'x'.repeat(MAX_TAG_LENGTH + 1);
      expect(validateSelfTags([tag])).toEqual({ ok: false, error: SELF_TAG_ERRORS.TOO_LONG });
    });

    it('validateSelfTags_atCountLimit_isAccepted', () => {
      const tags = Array.from({ length: MAX_SELF_TAGS }, (_, i) => `t${i}`);
      expect(validateSelfTags(tags).ok).toBe(true);
      expect(validateSelfTags(tags).tags.length).toBe(MAX_SELF_TAGS);
    });

    it('validateSelfTags_overCountLimit_rejected_evenWithDuplicates', () => {
      // 超限判定发生在去重之前：填 21 个（含重复）仍属超限，不放宽
      const tags = Array.from({ length: MAX_SELF_TAGS + 1 }, () => '重摇');
      expect(validateSelfTags(tags)).toEqual({ ok: false, error: SELF_TAG_ERRORS.TOO_MANY });
    });
  });

  describe('tagJaccard', () => {
    it('tagJaccard_identicalSets_returnsOne', () => {
      expect(tagJaccard(['后摇', '爵士'], ['爵士', '后摇'])).toBe(1);
    });

    it('tagJaccard_disjointSets_returnsZero', () => {
      expect(tagJaccard(['后摇'], ['说唱'])).toBe(0);
    });

    it('tagJaccard_partialOverlap_returnsIntersectionOverUnion', () => {
      // 交集 {b} 大小 1，并集 {a,b,c} 大小 3
      expect(tagJaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 6);
    });

    it('tagJaccard_eitherSideEmpty_returnsZero', () => {
      expect(tagJaccard([], ['a'])).toBe(0);
      expect(tagJaccard(['a'], [])).toBe(0);
      expect(tagJaccard([], [])).toBe(0);
    });

    it('tagJaccard_caseInsensitive', () => {
      expect(tagJaccard(['Rock'], ['rock'])).toBe(1);
    });

    it('tagJaccard_foldsSynonymsAndSpellingVariants', () => {
      // 判等必须与召回层同源：『爵士』『Jazz』『爵士乐』在 tagRecall 里是同一个桶，
      // 所以它们之间的 Jaccard 必须是 1。曾经这里只做小写比较，会把同一群人
      // 算成完全不重合——候选被召回、又被重排踢掉。
      expect(tagJaccard(['爵士'], ['Jazz'])).toBe(1);
      expect(tagJaccard(['爵士乐'], ['Jazz'])).toBe(1);
      expect(tagJaccard(['後搖'], ['post-rock'])).toBe(1);
      // 不同概念仍须分开：归一化过头会让推荐失去区分度。
      expect(tagJaccard(['摇滚'], ['金属'])).toBe(0);
    });
  });
});
