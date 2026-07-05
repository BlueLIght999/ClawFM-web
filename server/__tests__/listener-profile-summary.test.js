import { describe, it, expect } from 'vitest';
import {
  firstTopArtistQuery,
  topArtistNames,
} from '../domain/hosting/listenerProfileSummary.js';

describe('listener profile summary', () => {
  it('topArtistNames_formatsTopArtistsWithLimit', () => {
    const profile = {
      topArtists: [
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
      ],
    };

    expect(topArtistNames(profile, 2)).toBe('A, B');
  });

  it('topArtistNames_returnsFallbackForEmptyProfile', () => {
    expect(topArtistNames({}, 5, 'none yet')).toBe('none yet');
  });

  it('firstTopArtistQuery_prefersExplicitPreference', () => {
    const profile = { topArtists: [{ name: 'A' }] };

    expect(firstTopArtistQuery(profile, 'city pop')).toBe('city pop');
  });

  it('firstTopArtistQuery_fallsBackToFirstTopArtistThenDefaultQuery', () => {
    expect(firstTopArtistQuery({ topArtists: [{ name: 'A' }] }, '')).toBe('A');
    expect(firstTopArtistQuery({}, '')).toBe('热门');
  });
});
