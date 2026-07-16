/**
 * BaseSearchProvider — abstract base class for metadata search providers.
 *
 * Domain-layer abstraction. Concrete providers extend this and implement
 * search(song). No IO lives here; all IO is performed by adapters/clients
 * injected into the concrete subclass, so the domain stays pure.
 */

// Genre keywords shared by text-based tag extraction (album tags, wiki
// snippets, artist descriptions). Kept here so subclasses stay DRY
// (CODING-STYLE 1.5 — repeated logic >3x must be abstracted).
const GENRE_KEYWORDS = [
  'pop', 'rock', 'jazz', 'classical', 'electronic', 'hip-hop', 'hip hop',
  'rap', 'r&b', 'soul', 'folk', 'country', 'blues', 'metal', 'punk',
  'indie', 'alternative', 'dance', 'house', 'techno', 'ambient', 'chill',
  'acoustic', 'latin', 'reggae', 'funk', 'disco',
  '流行', '摇滚', '爵士', '古典', '电子', '说唱', '民谣', '乡村',
  '蓝调', '金属', '朋克', '独立', '另类', '舞曲', '灵魂', '节奏布鲁斯',
];

export class BaseSearchProvider {
  /**
   * @param {Object} opts
   * @param {string} [opts.name]    — provider display name (defaults to class name)
   * @param {number} [opts.timeout] — per-request timeout in ms (default 5000)
   */
  constructor({ name, timeout = 5000 } = {}) {
    this.name = name || this.constructor.name;
    this.timeout = timeout;
  }

  /**
   * Search for metadata tags for a song.
   * @param {Object} song — { title, artist, songId|id }
   * @returns {Promise<Object|null>} enrichment result or null
   * @throws always — subclasses must override.
   */
  async search(_song) {
    throw new Error('Not implemented');
  }

  /**
   * Normalize a song into a stable { title, artist, songId } triple.
   * Tolerates both songId and id keys (CODING-STYLE 1.5 songId(song) helper).
   */
  normalizeSong(song) {
    return {
      title: song.title || '',
      artist: song.artist || '',
      songId: song.songId || song.id || '',
    };
  }

  /**
   * Extract genre tags from free text by matching known genre keywords.
   * Shared helper for subclasses (album tags, wiki snippets, artist bios).
   * @param {string} text        — text to scan
   * @param {number} confidence — confidence to assign to inferred tags
   * @returns {Array<{name:string,category:string,confidence:number}>}
   */
  _extractGenreKeywords(text, confidence = 0.7) {
    if (!text) return [];
    const lower = String(text).toLowerCase();
    const tags = [];
    for (const keyword of GENRE_KEYWORDS) {
      if (lower.includes(keyword.toLowerCase())) {
        tags.push({ name: keyword, category: 'genre', confidence });
      }
    }
    return tags;
  }
}
