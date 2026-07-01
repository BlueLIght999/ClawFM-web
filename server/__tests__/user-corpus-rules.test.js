import { describe, it, expect } from 'vitest';
import {
  isTasteTemplate,
  isRoutinesTemplate,
  buildRoutinesMarkdown,
} from '../domain/curation/userCorpusRules.js';

/**
 * 特征测试 —— 钉住 recommender._writeUserCorpus 的纯逻辑：
 *   1. 判断 taste.md 是否仍是空模板（无非空列表项）
 *   2. 判断 routines.md 是否需填 genre（无 "Genre: X"）
 *   3. 构建 routines.md 内容
 * 提炼为纯函数后，fs 读写走注入的 CorpusPort。
 *
 * 现有行为(recommender.js):
 *   isEmpty:       !/^-\s*\S/m.test(taste)      —— 无非空 "- x" 列表项 = 模板
 *   routinesEmpty: existing && !/Genre: \S/     —— 有内容但无 "Genre: 值" = 需填
 */
describe('isTasteTemplate', () => {
  it('emptyString_isTemplate', () => {
    expect(isTasteTemplate('')).toBe(true);
  });

  it('noNonEmptyListItems_isTemplate', () => {
    expect(isTasteTemplate('# Title\n## Section\n- \n')).toBe(true);
  });

  it('hasNonEmptyListItem_isNotTemplate', () => {
    expect(isTasteTemplate('## Artists\n- Reol (892 plays)')).toBe(false);
  });
});

describe('isRoutinesTemplate', () => {
  it('emptyString_isNotTemplate', () => {
    // 现有行为: existingRoutines && ... → 空字符串为 falsy，判定 false
    expect(isRoutinesTemplate('')).toBe(false);
  });

  it('hasContentButNoGenreValue_isTemplate', () => {
    expect(isRoutinesTemplate('# Routines\n## Morning\nMood: gentle')).toBe(true);
  });

  it('hasGenreValue_isNotTemplate', () => {
    expect(isRoutinesTemplate('## Morning\nGenre: pop, acoustic')).toBe(false);
  });
});

describe('buildRoutinesMarkdown', () => {
  it('withTopArtists_fillsEveningGenre', () => {
    const md = buildRoutinesMarkdown(['周杰伦', 'Reol', '刘森']);
    expect(md).toContain('# Daily Routines');
    expect(md).toContain('Genre: 周杰伦, Reol, 刘森');
    expect(md).toContain('## Morning (06:00 - 10:00)');
    expect(md).toContain('## Weekend');
  });

  it('emptyArtists_usesDefaultEveningGenre', () => {
    const md = buildRoutinesMarkdown([]);
    expect(md).toContain('Genre: indie, electronic, jazz');
  });
});
