/**
 * WikiSearcher — searches Wikipedia for artist metadata.
 *
 * Extends BaseSearchProvider. The httpClient (with a .get(url, params)
 * method) is injected. Tags are inferred from the returned search snippet by
 * matching known genre keywords — wiki is the lowest-confidence source, used
 * only when Netease and MusicBrainz yield nothing.
 */

import { BaseSearchProvider } from './BaseSearchProvider.js';

const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
// Wiki tags are inferred from prose snippets, so the lowest confidence.
const WIKI_GENRE_CONFIDENCE = 0.6;

export class WikiSearcher extends BaseSearchProvider {
  /**
   * @param {Object} opts
   * @param {Object} opts.httpClient — injected client exposing get(url, params)
   * @param {number} [opts.timeout]
   */
  constructor({ httpClient, timeout } = {}) {
    super({ name: 'wiki', timeout });
    this.httpClient = httpClient;
  }

  /**
   * Search Wikipedia for the song's artist.
   * @param {Object} song — { title, artist, songId|id }
   * @returns {Promise<Object|null>} { source, tags, metadata:{ wiki_summary } } or null
   */
  async search(song) {
    if (!this.httpClient || typeof this.httpClient.get !== 'function') return null;
    const { artist, title } = this.normalizeSong(song);
    const query = artist || title;
    if (!query) return null;

    let response;
    try {
      response = await this.httpClient.get(WIKI_API_URL, {
        action: 'query',
        list: 'search',
        srsearch: query,
        format: 'json',
        limit: 1,
      });
    } catch {
      return null;
    }

    const snippet = this._firstSnippet(response);
    if (!snippet) return null;

    const tags = this._extractGenreKeywords(snippet, WIKI_GENRE_CONFIDENCE);

    return {
      source: 'wiki',
      tags,
      metadata: { wiki_summary: snippet },
    };
  }

  _firstSnippet(response) {
    const search = response && response.query && response.query.search;
    if (Array.isArray(search) && search.length > 0) {
      return search[0].snippet || '';
    }
    return '';
  }
}
