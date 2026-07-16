/**
 * NeteaseTagSearcher — searches the Netease (网易云) API for song/artist tags.
 *
 * Extends BaseSearchProvider. The concrete Netease adapter is injected, so
 * this domain object has no IO of its own. Adapter methods may not exist yet
 * during migration, so every call is guarded by existence + try/catch and
 * degrades to null rather than throwing.
 */

import { BaseSearchProvider } from './BaseSearchProvider.js';

// Confidence for tags pulled directly from album/song tags (authoritative).
const NETEASE_TAG_CONFIDENCE = 0.8;
// Confidence for genre keywords inferred from wiki/artist text (heuristic,
// so slightly lower than explicit tags).
const NETEASE_INFERRED_CONFIDENCE = 0.72;

export class NeteaseTagSearcher extends BaseSearchProvider {
  /**
   * @param {Object} opts
   * @param {Object} opts.neteaseAdapter — injected adapter (songDetail/songWiki/artistDetail)
   * @param {number} [opts.timeout]
   */
  constructor({ neteaseAdapter, timeout } = {}) {
    super({ name: 'netease_api', timeout });
    this.neteaseAdapter = neteaseAdapter;
  }

  /**
   * Search Netease for tags of a song.
   * @param {Object} song — { title, artist, songId|id }
   * @returns {Promise<Object|null>} { source, tags, metadata } or null if nothing found
   */
  async search(song) {
    if (!this.neteaseAdapter) return null;
    const { songId } = this.normalizeSong(song);
    if (!songId) return null;

    const detail = await this._safeCall('songDetail', songId);
    if (!detail) return null;

    const tags = [];
    let artistDesc = '';
    let wikiSummary = '';

    // Tags from album / song detail (authoritative genre tags).
    this._extractAlbumTags(detail, tags);

    // Wiki summary — extract genre keywords from descriptive text.
    const wiki = await this._safeCall('songWiki', songId);
    if (wiki) {
      wikiSummary = this._extractWikiSummary(wiki);
      tags.push(...this._extractGenreKeywords(wikiSummary, NETEASE_INFERRED_CONFIDENCE));
    }

    // Artist description — needs artist id resolved from song detail.
    const artistId = this._extractArtistId(detail, song);
    if (artistId) {
      const artistDetail = await this._safeCall('artistDetail', artistId);
      if (artistDetail) {
        artistDesc = this._extractArtistDesc(artistDetail);
        tags.push(...this._extractGenreKeywords(artistDesc, NETEASE_INFERRED_CONFIDENCE));
      }
    }

    // Nothing found at all → signal "no data" to the enrichment chain.
    if (tags.length === 0 && !artistDesc && !wikiSummary) return null;

    return {
      source: 'netease_api',
      tags: this._dedupeTags(tags),
      metadata: { artist_desc: artistDesc, wiki_summary: wikiSummary },
    };
  }

  /**
   * Call an adapter method defensively: returns null if the method is absent
   * or throws. Lets us tolerate an adapter that has not implemented every
   * endpoint yet (graceful degradation).
   */
  async _safeCall(method, ...args) {
    if (!this.neteaseAdapter || typeof this.neteaseAdapter[method] !== 'function') {
      return null;
    }
    try {
      return await this.neteaseAdapter[method](...args);
    } catch {
      return null;
    }
  }

  _firstSong(detail) {
    if (!detail) return null;
    if (Array.isArray(detail.songs) && detail.songs.length > 0) return detail.songs[0];
    if (detail.song) return detail.song;
    if (detail.id && (detail.ar || detail.al || detail.name)) return detail; // bare song
    return null;
  }

  _extractAlbumTags(detail, tags) {
    const song = this._firstSong(detail);
    if (!song) return;
    const album = song.al || song.album || {};
    const raw = album.tags || song.tags || detail.tags;
    const tagStr = Array.isArray(raw) ? raw.join(',') : String(raw || '');
    for (const part of tagStr.split(/[,;/|]/)) {
      const name = part.trim();
      if (name) tags.push({ name, category: 'genre', confidence: NETEASE_TAG_CONFIDENCE });
    }
  }

  _extractArtistId(detail, song) {
    const s = this._firstSong(detail) || song;
    const artists = s ? this._firstArtists(s) : null;
    if (Array.isArray(artists) && artists.length > 0) return this._idFromArtist(artists[0]);
    if (artists && typeof artists === 'object') return this._idFromArtist(artists);
    return this._fallbackArtistId(s, song);
  }

  _firstArtists(songData) {
    return songData.ar || songData.artists || songData.artist || null;
  }

  _idFromArtist(artist) {
    return artist?.id || artist?.artistId || '';
  }

  _fallbackArtistId(s, song) {
    return s?.artistId || s?.artist_id || song?.artistId || '';
  }

  _extractArtistDesc(detail) {
    const artist = detail.artist || (Array.isArray(detail.artists) ? detail.artists[0] : null) || detail.data || detail;
    return artist.briefDesc || artist.description || artist.intro || '';
  }

  _extractWikiSummary(wiki) {
    if (!wiki) return '';
    return wiki.summary || wiki.description || wiki.briefDesc || (typeof wiki === 'string' ? wiki : '');
  }

  /**
   * Deduplicate tags by name+category, preserving first occurrence (which,
   * because album tags are pushed first, keeps the higher-confidence entry).
   */
  _dedupeTags(tags) {
    const seen = new Map();
    for (const t of tags) {
      const key = `${t.name}|${t.category}`;
      if (!seen.has(key)) seen.set(key, t);
    }
    return [...seen.values()];
  }
}
