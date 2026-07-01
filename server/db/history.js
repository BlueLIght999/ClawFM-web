import { queryAll, queryOne, execute } from './schema.js';

export function getListenHistory(limit = 200) {
  return queryAll('SELECT * FROM listen_history ORDER BY played_at DESC LIMIT ?', [limit]);
}

export function recordListen({ song_id, title, artist, album, duration, source }) {
  return execute(
    'INSERT INTO listen_history (song_id, title, artist, album, duration, source) VALUES (?, ?, ?, ?, ?, ?)',
    [song_id, title, artist, album, duration, source]
  );
}

export function getRecentSongIds(limit = 200) {
  return queryAll('SELECT song_id FROM listen_history ORDER BY played_at DESC LIMIT ?', [limit])
    .map(r => r.song_id);
}

export function getArtistPlayCount(hours = 1) {
  return queryAll(
    `SELECT artist, COUNT(*) as cnt FROM listen_history
     WHERE played_at > datetime('now', '-' || ? || ' hours')
     GROUP BY artist ORDER BY cnt DESC`,
    [hours]
  );
}

export function getChatHistory(limit = 20) {
  return queryAll('SELECT role, content FROM chat_history ORDER BY id DESC LIMIT ?', [limit]).reverse();
}

export function saveChatMessage(role, content) {
  return execute('INSERT INTO chat_history (role, content) VALUES (?, ?)', [role, content]);
}

export function saveQueueSnapshot(stateJson) {
  execute('DELETE FROM queue_snapshot');
  return execute('INSERT INTO queue_snapshot (state_json) VALUES (?)', [stateJson]);
}

export function getLatestQueueSnapshot() {
  return queryOne('SELECT state_json FROM queue_snapshot ORDER BY id DESC LIMIT 1')?.state_json || null;
}

export function getSeedPool(limit = 500) {
  return queryAll('SELECT * FROM seed_pool ORDER BY play_count ASC, added_at DESC LIMIT ?', [limit]);
}

export function upsertSeedPool({ song_id, title, artist, album, duration, source, genre_tags }) {
  execute(
    `INSERT INTO seed_pool (song_id, title, artist, album, duration, source, genre_tags)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(song_id) DO UPDATE SET play_count = play_count`,
    [song_id, title, artist, album, duration, source, genre_tags || '[]']
  );
}

export function incrementPlayCount(songId) {
  execute('UPDATE seed_pool SET play_count = play_count + 1 WHERE song_id = ?', [songId]);
}

export function getUserProfile() {
  const rows = queryAll('SELECT key, value FROM user_profile');
  const profile = {};
  for (const row of rows) {
    try { profile[row.key] = JSON.parse(row.value); } catch { profile[row.key] = row.value; }
  }
  return profile;
}

export function setUserProfile(key, value) {
  const val = typeof value === 'string' ? value : JSON.stringify(value);
  execute(
    `INSERT INTO user_profile (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
    [key, val]
  );
}

export function savePlan(planJson, mood) {
  execute(
    'INSERT OR REPLACE INTO plan_cache (id, plan_json, plan_mood, generated_at) VALUES (1, ?, ?, CURRENT_TIMESTAMP)',
    [planJson, mood]
  );
}

export function getPlan() {
  const row = queryOne('SELECT plan_json, plan_mood, generated_at FROM plan_cache WHERE id = 1');
  if (!row) return null;
  try {
    return { plan: JSON.parse(row.plan_json), mood: row.plan_mood, generatedAt: row.generated_at };
  } catch {
    return null;
  }
}
