/**
 * dbRecovery — loads a sql.js Database with corruption recovery.
 *
 * Problem (H7): `initDb()` had no try/catch on `new SQL.Database(buf)`.
 * A corrupted DB file would crash the server on startup.
 *
 * Solution: wrap the load in try/catch. If it throws, create a fresh
 * empty database and log the error so the server can continue running.
 */

export function loadDatabaseWithRecovery({ SQL, buffer, logger = console }) {
  if (!buffer || buffer.length === 0) {
    logger.warn('[DB] No existing database file — creating fresh');
    return new SQL.Database();
  }

  try {
    return new SQL.Database(buffer);
  } catch (e) {
    logger.error('[DB] Database file corrupted — creating fresh:', e.message);
    return new SQL.Database();
  }
}
