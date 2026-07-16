/**
 * Profile system DB layer — table creation + data access functions.
 * Zero-invasion: does not modify existing schema.js; tables are created
 * via initProfileDb() called from bootstrap.js after initDb().
 */
import { queryAll, queryOne, execute, getDb } from './schema.js';

// ── Schema ──────────────────────────────────────────────

export function initProfileDb() {
  const db = getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS profile_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_json TEXT NOT NULL,
      schema_version INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS profile_collection_state (
      collector_name TEXT PRIMARY KEY,
      last_run_at DATETIME,
      is_first_run INTEGER DEFAULT 1,
      run_count INTEGER DEFAULT 0,
      state_json TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS style_tags_cache (
      tag_id TEXT PRIMARY KEY,
      tag_name TEXT NOT NULL,
      category TEXT,
      raw_json TEXT,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS song_style_mapping (
      song_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      tag_name TEXT NOT NULL,
      confidence REAL DEFAULT 0.7,
      source TEXT DEFAULT 'unknown',
      mapped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (song_id, tag_id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS cluster_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id TEXT NOT NULL,
      cluster_label TEXT,
      feature_json TEXT NOT NULL,
      member_count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('[DB] Profile tables initialized');
}

// ── profile_snapshots ───────────────────────────────────

export function saveProfileSnapshot(snapshotJson, schemaVersion = 1) {
  execute(
    'INSERT INTO profile_snapshots (snapshot_json, schema_version) VALUES (?, ?)',
    [snapshotJson, schemaVersion],
  );
}

export function getProfileSnapshots(limit = 30) {
  return queryAll(
    'SELECT * FROM profile_snapshots ORDER BY created_at DESC LIMIT ?',
    [limit],
  );
}

export function getLatestProfileSnapshot() {
  return queryOne('SELECT * FROM profile_snapshots ORDER BY id DESC LIMIT 1');
}

// ── profile_collection_state ────────────────────────────

export function getCollectionState(collectorName) {
  return queryOne(
    'SELECT * FROM profile_collection_state WHERE collector_name = ?',
    [collectorName],
  );
}

export function upsertCollectionState(collectorName, { lastRunAt, isFirstRun, runCount, stateJson } = {}) {
  execute(
    `INSERT INTO profile_collection_state (collector_name, last_run_at, is_first_run, run_count, state_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(collector_name) DO UPDATE SET
       last_run_at = excluded.last_run_at,
       is_first_run = excluded.is_first_run,
       run_count = excluded.run_count,
       state_json = excluded.state_json`,
    [collectorName, lastRunAt, isFirstRun ?? 1, runCount ?? 0, stateJson ?? null],
  );
}

export function getAllCollectionStates() {
  return queryAll('SELECT * FROM profile_collection_state');
}

// ── style_tags_cache ────────────────────────────────────

export function upsertStyleTag({ tagId, tagName, category, rawJson }) {
  execute(
    `INSERT INTO style_tags_cache (tag_id, tag_name, category, raw_json, cached_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(tag_id) DO UPDATE SET
       tag_name = excluded.tag_name,
       category = excluded.category,
       raw_json = excluded.raw_json,
       cached_at = CURRENT_TIMESTAMP`,
    [tagId, tagName, category, rawJson ?? null],
  );
}

export function getAllStyleTags() {
  return queryAll('SELECT * FROM style_tags_cache');
}

export function getStyleTagsByCategory(category) {
  return queryAll('SELECT * FROM style_tags_cache WHERE category = ?', [category]);
}

// ── song_style_mapping ──────────────────────────────────

export function upsertSongStyleMapping({ songId, tagId, tagName, confidence, source }) {
  execute(
    `INSERT INTO song_style_mapping (song_id, tag_id, tag_name, confidence, source, mapped_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(song_id, tag_id) DO UPDATE SET
       tag_name = excluded.tag_name,
       confidence = excluded.confidence,
       source = excluded.source,
       mapped_at = CURRENT_TIMESTAMP`,
    [songId, tagId, tagName, confidence ?? 0.7, source ?? 'unknown'],
  );
}

export function getSongStyleMappings(songId) {
  return queryAll('SELECT * FROM song_style_mapping WHERE song_id = ?', [songId]);
}

export function getAllSongStyleMappings(limit = 500) {
  return queryAll('SELECT * FROM song_style_mapping LIMIT ?', [limit]);
}

// ── cluster_results ─────────────────────────────────────

export function saveClusterResult({ clusterId, clusterLabel, featureJson, memberCount }) {
  execute(
    'INSERT INTO cluster_results (cluster_id, cluster_label, feature_json, member_count) VALUES (?, ?, ?, ?)',
    [clusterId, clusterLabel, featureJson, memberCount ?? 1],
  );
}

export function getLatestClusterResults() {
  return queryAll(
    'SELECT * FROM cluster_results ORDER BY created_at DESC LIMIT ?',
    [10],
  );
}
