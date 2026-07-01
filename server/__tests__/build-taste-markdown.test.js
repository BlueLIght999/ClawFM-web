import { describe, it, expect } from 'vitest';
import { buildTasteMarkdown } from '../domain/curation/buildTasteMarkdown.js';

/**
 * 特征测试 —— 钉住 recommender._writeUserCorpus 的 taste.md 内容构建逻辑。
 * 提炼为纯函数（日期作参数传入，去除 new Date 副作用），可单测。
 *
 * 现有行为(recommender.js:148-163):
 *   # User Taste Profile
 *   ## Favorite Artists
 *   <!-- Auto-generated from listening history: {N} songs analyzed -->
 *   - {name} ({count} plays)  (top10)
 *   ## Favorite Genres  ...
 *   ## Languages / ## Notes(top5 names + date)
 */
describe('buildTasteMarkdown', () => {
  const artists = [
    { name: 'Reol', count: 892 },
    { name: '周杰伦', count: 445 },
  ];

  it('includesSongCountAndTopArtists', () => {
    const md = buildTasteMarkdown({ topArtists: artists, topGenres: [], totalSongs: 647, date: '2026-07-01' });
    expect(md).toContain('647 songs analyzed');
    expect(md).toContain('- Reol (892 plays)');
    expect(md).toContain('- 周杰伦 (445 plays)');
  });

  it('emptyGenres_usesAutoDetectedPlaceholder', () => {
    const md = buildTasteMarkdown({ topArtists: artists, topGenres: [], totalSongs: 100, date: '2026-07-01' });
    expect(md).toContain('- (auto-detected from listening)');
  });

  it('withGenres_listsThem', () => {
    const md = buildTasteMarkdown({
      topArtists: artists,
      topGenres: [{ name: 'rock' }, { name: 'jazz' }],
      totalSongs: 100,
      date: '2026-07-01',
    });
    expect(md).toContain('- rock');
    expect(md).toContain('- jazz');
  });

  it('notesSectionHasTop5NamesAndDate', () => {
    const md = buildTasteMarkdown({ topArtists: artists, topGenres: [], totalSongs: 100, date: '2026-07-01' });
    expect(md).toContain('Top artists: Reol, 周杰伦');
    expect(md).toContain('2026-07-01');
  });
});
