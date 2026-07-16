/**
 * MusicBrainzSearcher — searches the MusicBrainz API for recording/artist metadata.
 *
 * Extends BaseSearchProvider. The httpClient (with a .get(url, params) method)
 * is injected, so this domain object performs no IO of its own.
 */

import { BaseSearchProvider } from './BaseSearchProvider.js';

const MUSICBRAINZ_RECORDING_URL = 'https://musicbrainz.org/ws/2/recording';
// MusicBrainz genres are community-voted tags — solid but second-hand, so
// a notch below the user's own library (Netease) confidence.
const MB_GENRE_CONFIDENCE = 0.75;

export class MusicBrainzSearcher extends BaseSearchProvider {
  /**
   * @param {Object} opts
   * @param {Object} opts.httpClient — injected client exposing get(url, params)
   * @param {number} [opts.timeout]
   */
  constructor({ httpClient, timeout } = {}) {
    super({ name: 'musicbrainz', timeout });
    this.httpClient = httpClient;
  }

  /**
   * Search MusicBrainz for a recording matching the song.
   * @param {Object} song — { title, artist, songId|id }
   * @returns {Promise<Object|null>} { source, tags, metadata:{ mbid, genres } } or null
   */
  async search(song) {
    if (!this.httpClient || typeof this.httpClient.get !== 'function') return null;
    const { title, artist } = this.normalizeSong(song);
    if (!title) return null;

    let response;
    try {
      response = await this.httpClient.get(MUSICBRAINZ_RECORDING_URL, {
        query: `recording:"${title}" AND artist:"${artist}"`,
        fmt: 'json',
        limit: 1,
      });
    } catch {
      return null;
    }

    const recording = this._firstRecording(response);
    if (!recording) return null;

    const genres = recording.genres || response.genres || [];
    const tags = genres
      .filter((g) => g && g.name)
      .map((g) => ({ name: g.name, category: 'genre', confidence: MB_GENRE_CONFIDENCE }));

    return {
      source: 'musicbrainz',
      tags,
      metadata: {
        mbid: recording.id || '',
        genres: genres.map((g) => g.name).filter(Boolean),
      },
    };
  }

  _firstRecording(response) {
    if (!response) return null;
    if (Array.isArray(response.recordings) && response.recordings.length > 0) {
      return response.recordings[0];
    }
    if (response.id) return response; // bare recording object
    return null;
  }
}
