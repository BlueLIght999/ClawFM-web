import { describe, it, expect, vi } from 'vitest';

import { BaseSearchProvider } from '../domain/profile/search/BaseSearchProvider.js';
import { NeteaseTagSearcher } from '../domain/profile/search/NeteaseTagSearcher.js';
import { MusicBrainzSearcher } from '../domain/profile/search/MusicBrainzSearcher.js';
import { WikiSearcher } from '../domain/profile/search/WikiSearcher.js';
import { enrichSongMetadata, createEnrichmentChain } from '../domain/profile/enrichment/enrichSongMetadata.js';

/**
 * Profile search providers + enrichment chain.
 *
 * Unit tests — pure domain logic with injected fakes (vi.fn). No network,
 * no DB, no real adapters. Covers the normal path, edge cases (missing ids /
 * missing adapter methods) and the degradation behaviour of the chain.
 */

describe('BaseSearchProvider', () => {
  it('search_notOverridden_throwsNotImplemented', async () => {
    const provider = new BaseSearchProvider({ name: 'base' });
    await expect(provider.search({})).rejects.toThrow('Not implemented');
  });

  it('normalizeSong_songHasIdButNoSongId_fallsBackToId', () => {
    const provider = new BaseSearchProvider();
    expect(provider.normalizeSong({ title: 'T', artist: 'A', id: '123' })).toEqual({
      title: 'T',
      artist: 'A',
      songId: '123',
    });
  });

  it('normalizeSong_missingFields_returnsEmptyStrings', () => {
    const provider = new BaseSearchProvider();
    expect(provider.normalizeSong({})).toEqual({ title: '', artist: '', songId: '' });
  });

  it('constructor_nameOmitted_defaultsToClassName', () => {
    expect(new BaseSearchProvider().name).toBe('BaseSearchProvider');
    expect(new BaseSearchProvider({ name: 'custom' }).name).toBe('custom');
  });

  it('constructor_timeoutOmitted_defaultsTo5000', () => {
    expect(new BaseSearchProvider().timeout).toBe(5000);
  });
});

describe('NeteaseTagSearcher', () => {
  it('search_albumAndWikiAndArtistPresent_aggregatesGenreTags', async () => {
    const neteaseAdapter = {
      songDetail: vi.fn().mockResolvedValue({
        songs: [
          {
            id: 's1',
            name: 'Song',
            ar: [{ id: 'a1', name: 'Artist' }],
            al: { tags: 'pop,rock' },
          },
        ],
      }),
      artistDetail: vi.fn().mockResolvedValue({ artist: { briefDesc: 'An indie pop band' } }),
      songWiki: vi.fn().mockResolvedValue({ summary: 'A jazz-influenced track' }),
    };

    const searcher = new NeteaseTagSearcher({ neteaseAdapter });
    const result = await searcher.search({ title: 'Song', artist: 'Artist', songId: 's1' });

    expect(result.source).toBe('netease_api');
    const names = result.tags.map((t) => t.name.toLowerCase());
    expect(names).toEqual(expect.arrayContaining(['pop', 'rock', 'indie', 'jazz']));
    // Album tags are authoritative (0.8); inferred keywords are lower (0.72).
    const popTag = result.tags.find((t) => t.name.toLowerCase() === 'pop');
    expect(popTag.confidence).toBe(0.8);
    const jazzTag = result.tags.find((t) => t.name.toLowerCase() === 'jazz');
    expect(jazzTag.confidence).toBe(0.72);

    expect(result.metadata.artist_desc).toBe('An indie pop band');
    expect(result.metadata.wiki_summary).toBe('A jazz-influenced track');
    expect(neteaseAdapter.songDetail).toHaveBeenCalledWith('s1');
    expect(neteaseAdapter.artistDetail).toHaveBeenCalledWith('a1');
    expect(neteaseAdapter.songWiki).toHaveBeenCalledWith('s1');
  });

  it('search_songIdMissing_returnsNull', async () => {
    const searcher = new NeteaseTagSearcher({ neteaseAdapter: {} });
    expect(await searcher.search({ title: 'Song', artist: 'Artist' })).toBeNull();
  });

  it('search_adapterMissing_returnsNull', async () => {
    const searcher = new NeteaseTagSearcher({});
    expect(await searcher.search({ title: 'Song', artist: 'Artist', songId: 's1' })).toBeNull();
  });

  it('search_adapterMethodMissing_returnsNullWithoutThrowing', async () => {
    // songDetail exists but returns a tagless song; artistDetail/songWiki absent.
    const neteaseAdapter = {
      songDetail: vi.fn().mockResolvedValue({ songs: [{ id: 's1', al: {} }] }),
    };
    const searcher = new NeteaseTagSearcher({ neteaseAdapter });
    expect(await searcher.search({ title: 'Song', artist: 'Artist', songId: 's1' })).toBeNull();
  });

  it('search_songDetailRejects_returnsNullSafely', async () => {
    const neteaseAdapter = { songDetail: vi.fn().mockRejectedValue(new Error('network')) };
    const searcher = new NeteaseTagSearcher({ neteaseAdapter });
    expect(await searcher.search({ songId: 's1' })).toBeNull();
  });

  it('search_albumTagsOnly_returnsTagsWithNoMetadata', async () => {
    const neteaseAdapter = {
      songDetail: vi.fn().mockResolvedValue({ songs: [{ id: 's1', al: { tags: 'folk' } }] }),
    };
    const searcher = new NeteaseTagSearcher({ neteaseAdapter });
    const result = await searcher.search({ songId: 's1' });
    expect(result.tags.map((t) => t.name)).toEqual(['folk']);
    expect(result.metadata).toEqual({ artist_desc: '', wiki_summary: '' });
  });
});

describe('MusicBrainzSearcher', () => {
  it('search_genresPresent_returnsTaggedResultWithMbid', async () => {
    const httpClient = {
      get: vi.fn().mockResolvedValue({
        recordings: [{ id: 'mbid-1', genres: [{ name: 'rock' }, { name: 'alternative' }] }],
      }),
    };
    const searcher = new MusicBrainzSearcher({ httpClient });

    const result = await searcher.search({ title: 'Song', artist: 'Artist' });

    expect(result.source).toBe('musicbrainz');
    expect(result.tags).toEqual([
      { name: 'rock', category: 'genre', confidence: 0.75 },
      { name: 'alternative', category: 'genre', confidence: 0.75 },
    ]);
    expect(result.metadata.mbid).toBe('mbid-1');
    expect(result.metadata.genres).toEqual(['rock', 'alternative']);
    expect(httpClient.get).toHaveBeenCalledWith(
      'https://musicbrainz.org/ws/2/recording',
      expect.objectContaining({ fmt: 'json', limit: 1, query: 'recording:"Song" AND artist:"Artist"' })
    );
  });

  it('search_noRecordings_returnsNull', async () => {
    const httpClient = { get: vi.fn().mockResolvedValue({ recordings: [] }) };
    expect(await new MusicBrainzSearcher({ httpClient }).search({ title: 'Song', artist: 'Artist' })).toBeNull();
  });

  it('search_httpGetRejects_returnsNull', async () => {
    const httpClient = { get: vi.fn().mockRejectedValue(new Error('timeout')) };
    expect(await new MusicBrainzSearcher({ httpClient }).search({ title: 'Song', artist: 'Artist' })).toBeNull();
  });

  it('search_titleMissing_returnsNullWithoutCallingHttp', async () => {
    const httpClient = { get: vi.fn() };
    expect(await new MusicBrainzSearcher({ httpClient }).search({ artist: 'Artist' })).toBeNull();
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it('search_httpClientMissing_returnsNull', async () => {
    expect(await new MusicBrainzSearcher({}).search({ title: 'Song', artist: 'Artist' })).toBeNull();
  });
});

describe('WikiSearcher', () => {
  it('search_snippetHasGenres_returnsInferredTags', async () => {
    const httpClient = {
      get: vi.fn().mockResolvedValue({
        query: { search: [{ snippet: 'The band plays <em>jazz</em> and soul music' }] },
      }),
    };
    const searcher = new WikiSearcher({ httpClient });

    const result = await searcher.search({ title: 'Song', artist: 'Jazz Band' });

    expect(result.source).toBe('wiki');
    const names = result.tags.map((t) => t.name.toLowerCase());
    expect(names).toEqual(expect.arrayContaining(['jazz', 'soul']));
    expect(result.tags[0]).toMatchObject({ category: 'genre', confidence: 0.6 });
    expect(result.metadata.wiki_summary).toContain('jazz');
    expect(httpClient.get).toHaveBeenCalledWith(
      'https://en.wikipedia.org/w/api.php',
      expect.objectContaining({ action: 'query', list: 'search', format: 'json', srsearch: 'Jazz Band' })
    );
  });

  it('search_emptyResults_returnsNull', async () => {
    const httpClient = { get: vi.fn().mockResolvedValue({ query: { search: [] } }) };
    expect(await new WikiSearcher({ httpClient }).search({ artist: 'Nobody' })).toBeNull();
  });

  it('search_httpGetRejects_returnsNull', async () => {
    const httpClient = { get: vi.fn().mockRejectedValue(new Error('boom')) };
    expect(await new WikiSearcher({ httpClient }).search({ artist: 'Nobody' })).toBeNull();
  });

  it('search_artistMissing_fallsBackToTitleForQuery', async () => {
    const httpClient = { get: vi.fn().mockResolvedValue({ query: { search: [{ snippet: 'rock ballad' }] } }) };
    const searcher = new WikiSearcher({ httpClient });
    const result = await searcher.search({ title: 'Song Title', artist: '' });
    expect(result.source).toBe('wiki');
    expect(httpClient.get).toHaveBeenCalledWith(
      'https://en.wikipedia.org/w/api.php',
      expect.objectContaining({ srsearch: 'Song Title' })
    );
  });

  it('search_httpClientMissing_returnsNull', async () => {
    expect(await new WikiSearcher({}).search({ artist: 'Nobody' })).toBeNull();
  });
});

describe('enrichSongMetadata', () => {
  it('enrich_firstProviderReturnsTags_returnsEnrichedResultAndStops', async () => {
    const second = { name: 'second', search: vi.fn() };
    const chain = [
      { name: 'first', search: vi.fn().mockResolvedValue({ source: 'first', tags: [{ name: 'pop' }], metadata: {} }) },
      second,
    ];

    const result = await enrichSongMetadata({ songId: 's1' }, { chain });

    expect(result).toMatchObject({ source: 'first', songId: 's1', _enriched: true });
    expect(result.tags).toHaveLength(1);
    expect(second.search).not.toHaveBeenCalled();
  });

  it('enrich_providerThrows_degradesToNextProvider', async () => {
    const chain = [
      { name: 'first', search: vi.fn().mockRejectedValue(new Error('down')) },
      { name: 'second', search: vi.fn().mockResolvedValue({ source: 'second', tags: [{ name: 'rock' }], metadata: {} }) },
    ];

    const result = await enrichSongMetadata({ songId: 's1' }, { chain });

    expect(result).toMatchObject({ source: 'second', _enriched: true });
  });

  it('enrich_providerReturnsEmptyTags_advancesToNext', async () => {
    const chain = [
      { name: 'first', search: vi.fn().mockResolvedValue({ source: 'first', tags: [], metadata: {} }) },
      { name: 'second', search: vi.fn().mockResolvedValue({ source: 'second', tags: [{ name: 'jazz' }], metadata: {} }) },
    ];

    const result = await enrichSongMetadata({ songId: 's1' }, { chain });

    expect(result.source).toBe('second');
  });

  it('enrich_providerReturnsNull_advancesToNext', async () => {
    const chain = [
      { name: 'first', search: vi.fn().mockResolvedValue(null) },
      { name: 'second', search: vi.fn().mockResolvedValue({ source: 'second', tags: [{ name: 'rock' }], metadata: {} }) },
    ];

    expect((await enrichSongMetadata({ songId: 's1' }, { chain })).source).toBe('second');
  });

  it('enrich_allProvidersEmpty_returnsUnknownMarkedResult', async () => {
    const chain = [
      { name: 'first', search: vi.fn().mockResolvedValue({ source: 'first', tags: [], metadata: {} }) },
      { name: 'second', search: vi.fn().mockResolvedValue(null) },
    ];

    const result = await enrichSongMetadata({ songId: 's1' }, { chain });

    expect(result).toMatchObject({ source: 'unknown', _enriched: false, songId: 's1' });
    expect(result.tags).toEqual([]);
  });

  it('enrich_emptyChain_returnsUnknownMarkedResult', async () => {
    const result = await enrichSongMetadata({ songId: 's1' }, { chain: [] });
    expect(result).toMatchObject({ source: 'unknown', _enriched: false });
  });

  it('enrich_eventBusProvided_emitsProgressOnSuccess', async () => {
    const eventBus = { emit: vi.fn() };
    const chain = [
      { name: 'first', search: vi.fn().mockResolvedValue({ source: 'first', tags: [{ name: 'pop' }], metadata: {} }) },
    ];

    await enrichSongMetadata({ songId: 's1' }, { chain, eventBus });

    expect(eventBus.emit).toHaveBeenCalledWith(
      'enrichment:progress',
      expect.objectContaining({ songId: 's1', provider: 'first', tagCount: 1 })
    );
  });

  it('enrich_noProviderSucceeds_emitsUnknownProgress', async () => {
    const eventBus = { emit: vi.fn() };
    const chain = [{ name: 'first', search: vi.fn().mockResolvedValue(null) }];

    await enrichSongMetadata({ songId: 's1' }, { chain, eventBus });

    expect(eventBus.emit).toHaveBeenCalledWith(
      'enrichment:progress',
      expect.objectContaining({ provider: 'unknown', tagCount: 0 })
    );
  });

  it('enrich_songUsesIdField_resolvesSongIdFromId', async () => {
    const chain = [
      { name: 'first', search: vi.fn().mockResolvedValue({ source: 'first', tags: [{ name: 'pop' }], metadata: {} }) },
    ];

    const result = await enrichSongMetadata({ id: 'legacy-1' }, { chain });

    expect(result.songId).toBe('legacy-1');
  });
});

describe('createEnrichmentChain', () => {
  it('createEnrichmentChain_allAdaptersProvided_buildsThreeProviders', () => {
    const chain = createEnrichmentChain({
      neteaseAdapter: { songDetail: () => {} },
      httpClient: { get: () => {} },
      config: {},
    });
    expect(chain.map((p) => p.name)).toEqual(['netease_api', 'musicbrainz', 'wiki']);
  });

  it('createEnrichmentChain_neteaseAdapterMissing_omitsNeteaseProvider', () => {
    const chain = createEnrichmentChain({ httpClient: { get: () => {} } });
    expect(chain.map((p) => p.name)).toEqual(['musicbrainz', 'wiki']);
  });

  it('createEnrichmentChain_httpClientMissing_omitsHttpProviders', () => {
    const chain = createEnrichmentChain({ neteaseAdapter: { songDetail: () => {} } });
    expect(chain.map((p) => p.name)).toEqual(['netease_api']);
  });

  it('createEnrichmentChain_configEnablesOnlyWiki_returnsSingleProvider', () => {
    const chain = createEnrichmentChain({
      neteaseAdapter: { songDetail: () => {} },
      httpClient: { get: () => {} },
      config: { enabled: ['wiki'] },
    });
    expect(chain.map((p) => p.name)).toEqual(['wiki']);
  });
});
