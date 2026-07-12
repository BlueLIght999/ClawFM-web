import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import config from '../config.js';

let db = null;
let saveTimer = null;

const DB_PATH = config.db.path;

function ensureDir(p) {
  const d = path.dirname(p);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

export async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = MEMORY');
  db.run('PRAGMA foreign_keys = ON');

  createTables(db);

  saveDb();

  // Auto-save every 30 seconds
  saveTimer = setInterval(saveDb, 30000);

  console.log('[DB] Initialized (sql.js)');
  return db;
}

function createTables(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS listen_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id TEXT NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      duration INTEGER,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source TEXT,
      skipped INTEGER DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS seed_pool (
      song_id TEXT PRIMARY KEY,
      title TEXT,
      artist TEXT,
      album TEXT,
      duration INTEGER,
      source TEXT,
      genre_tags TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      play_count INTEGER DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS user_profile (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS queue_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state_json TEXT NOT NULL,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS netease_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cookie TEXT,
      user_id TEXT,
      nickname TEXT,
      avatar_url TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS plan_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      plan_json TEXT NOT NULL,
      plan_mood TEXT NOT NULL,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export function saveDb() {
  if (!db) return;
  try {
    ensureDir(DB_PATH);
    const data = db.export();
    const buf = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buf);
  } catch (e) {
    console.error('[DB] Save failed:', e.message);
  }
}

export function getDb() {
  if (!db) throw new Error('DB not initialized. Call initDb() first.');
  return db;
}

// Helper: run a query and return all rows
export function queryAll(sql, params = []) {
  const d = getDb();
  const stmt = d.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// Helper: run a query and return first row
export function queryOne(sql, params = []) {
  const d = getDb();
  const stmt = d.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) result = stmt.getAsObject();
  stmt.free();
  return result;
}

// Helper: execute a statement (INSERT/UPDATE/DELETE)
export function execute(sql, params = []) {
  const d = getDb();
  const safe = params.map(p => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'object') return JSON.stringify(p);
    return p;
  });
  try {
    d.run(sql, safe);
  } catch (e) {
    console.error('[DB] execute error:', e.message, 'sql:', sql.slice(0, 80));
  }
  saveDb();
}

export function closeDb() {
  if (saveTimer) clearInterval(saveTimer);
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}
