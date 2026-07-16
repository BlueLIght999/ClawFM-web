import {
  upsertStyleTag,
  getAllStyleTags,
  getStyleTagsByCategory,
  upsertSongStyleMapping,
  getSongStyleMappings,
  getAllSongStyleMappings,
} from '../../../db/profileDb.js';

function toLegacyStyleTag({ tagId, tagName, category, raw }) {
  return {
    tagId,
    tagName,
    category,
    rawJson: raw !== null && raw !== undefined ? JSON.stringify(raw) : null,
  };
}

function toStyleTag(row) {
  return {
    tagId: String(row.tag_id ?? row.tagId ?? ''),
    tagName: row.tag_name || '',
    category: row.category,
    cachedAt: row.cached_at ?? row.cachedAt,
  };
}

function toSongStyleMapping(row) {
  return {
    songId: String(row.song_id ?? row.songId ?? ''),
    tagId: String(row.tag_id ?? row.tagId ?? ''),
    tagName: row.tag_name || '',
    confidence: row.confidence ?? 0.7,
    source: row.source || '',
    mappedAt: row.mapped_at ?? row.mappedAt,
  };
}

/**
 * Wraps legacy db/profileDb style-tag cache + song-style mapping functions
 * behind StyleTagCacheRepository.
 *
 * @param {object=} legacy
 */
export function createLegacyStyleTagCacheRepository(legacy = {
  upsertStyleTag,
  getAllStyleTags,
  getStyleTagsByCategory,
  upsertSongStyleMapping,
  getSongStyleMappings,
  getAllSongStyleMappings,
}) {
  return {
    upsertTag(tag) {
      legacy.upsertStyleTag(toLegacyStyleTag(tag));
    },
    getAllTags() {
      return (legacy.getAllStyleTags() || []).map(toStyleTag);
    },
    getTagsByCategory(category) {
      return (legacy.getStyleTagsByCategory(category) || []).map(toStyleTag);
    },
    upsertMapping(mapping) {
      legacy.upsertSongStyleMapping(mapping);
    },
    getMappings(songId) {
      return (legacy.getSongStyleMappings(songId) || []).map(toSongStyleMapping);
    },
    getAllMappings(limit) {
      return (legacy.getAllSongStyleMappings(limit) || []).map(toSongStyleMapping);
    },
  };
}

export const legacyStyleTagCacheRepository = createLegacyStyleTagCacheRepository();
