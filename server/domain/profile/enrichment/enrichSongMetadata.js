/**
 * enrichSongMetadata — four-level degradation chain for song metadata enrichment.
 *
 * Levels (tried in order, first with tags wins):
 *   1. Netease API     — user's own library, highest confidence
 *   2. MusicBrainz     — community metadata
 *   3. Wikipedia       — artist context (lowest confidence)
 *   4. unknown         — mark as un-enriched (no tags)
 *
 * A failing provider never breaks the chain: each call is wrapped in
 * try/catch and an empty/null result simply advances to the next provider.
 */

import { NeteaseTagSearcher } from '../search/NeteaseTagSearcher.js';
import { MusicBrainzSearcher } from '../search/MusicBrainzSearcher.js';
import { WikiSearcher } from '../search/WikiSearcher.js';

// Default degradation order. config.enabled can shrink/reorder this.
const DEFAULT_ENABLED_PROVIDERS = ['netease', 'musicbrainz', 'wiki'];

/**
 * Enrich a single song by walking the provider chain.
 * @param {Object} song                          — { title, artist, songId|id }
 * @param {Object} opts
 * @param {Array}  [opts.chain=[]]              — ordered list of providers (.name, .search)
 * @param {Object} [opts.eventBus=null]         — optional bus to emit enrichment:progress
 * @returns {Promise<Object>} enrichment result; _enriched=false when nothing found
 */
function getSongId(song) {
  return song.songId || song.id;
}

function emitProgress(eventBus, songId, provider, tagCount) {
  if (eventBus) {
    eventBus.emit('enrichment:progress', { songId, provider, tagCount });
  }
}

async function tryProvider(provider, song) {
  try {
    const result = await provider.search(song);
    if (result && result.tags && result.tags.length > 0) return result;
  } catch (e) {
    // Provider failed — degrade to the next one.
    console.warn(`[EnrichSong] Provider ${provider.name || 'unknown'} failed (degraded):`, e.message);
  }
  return null;
}

export async function enrichSongMetadata(song, { chain = [], eventBus = null } = {}) {
  const songId = getSongId(song);
  for (const provider of chain) {
    const result = await tryProvider(provider, song);
    if (result) {
      emitProgress(eventBus, songId, provider.name, result.tags.length);
      return { ...result, songId, _enriched: true };
    }
  }
  emitProgress(eventBus, songId, 'unknown', 0);
  return { source: 'unknown', tags: [], metadata: {}, songId, _enriched: false };
}

/**
 * Build the enrichment chain from injected adapters and config.
 *
 * Only providers whose adapter/client is present are included, so a missing
 * dependency degrades gracefully instead of crashing the chain.
 *
 * @param {Object} opts
 * @param {Object} [opts.neteaseAdapter] — Netease adapter (enables the netease provider)
 * @param {Object} [opts.httpClient]     — HTTP client (enables musicbrainz + wiki)
 * @param {Object} [opts.config]          — { enabled:string[], timeout:number }
 * @returns {Array<BaseSearchProvider>}
 */
export function createEnrichmentChain({ neteaseAdapter, httpClient, config = {} } = {}) {
  const enabled = config.enabled || DEFAULT_ENABLED_PROVIDERS;
  const timeout = config.timeout;
  const chain = [];

  if (enabled.includes('netease') && neteaseAdapter) {
    chain.push(new NeteaseTagSearcher({ neteaseAdapter, timeout }));
  }
  if (enabled.includes('musicbrainz') && httpClient) {
    chain.push(new MusicBrainzSearcher({ httpClient, timeout }));
  }
  if (enabled.includes('wiki') && httpClient) {
    chain.push(new WikiSearcher({ httpClient, timeout }));
  }
  return chain;
}
