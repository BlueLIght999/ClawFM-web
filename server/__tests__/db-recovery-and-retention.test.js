import { describe, test, expect, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { loadDatabaseWithRecovery } from '../domain/db/dbRecovery.js';
import { historyRetentionSql, MAX_HISTORY_ROWS } from '../domain/db/historyRetention.js';

describe('H7: DB corruption recovery', () => {
  test('creates fresh DB when buffer is null (no existing file)', async () => {
    const SQL = await initSqlJs();
    const logger = { warn: vi.fn(), error: vi.fn() };

    const db = loadDatabaseWithRecovery({ SQL, buffer: null, logger });

    expect(db).toBeDefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('creating fresh'));
  });

  test('creates fresh DB when buffer is empty', async () => {
    const SQL = await initSqlJs();
    const logger = { warn: vi.fn(), error: vi.fn() };

    const db = loadDatabaseWithRecovery({ SQL, buffer: Buffer.alloc(0), logger });

    expect(db).toBeDefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  test('recovers gracefully from corrupted DB file', () => {
    // Use a mock SQL that throws when given a corrupted buffer,
    // simulating real corruption that causes sql.js to fail
    const mockSQL = {
      Database: class MockDatabase {
        constructor(buffer) {
          if (buffer && buffer.length > 0) {
            throw new Error('Unable to read database file: file is not a database');
          }
        }
      },
    };
    const logger = { warn: vi.fn(), error: vi.fn() };
    const corruptedBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE]);

    const db = loadDatabaseWithRecovery({ SQL: mockSQL, buffer: corruptedBuffer, logger });

    expect(db).toBeDefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('corrupted'),
      expect.any(String),
    );
  });

  test('loads valid DB buffer without warnings or errors', async () => {
    const SQL = await initSqlJs();
    const logger = { warn: vi.fn(), error: vi.fn() };
    // Create a valid DB, export it, then reload
    const validDb = new SQL.Database();
    validDb.run('CREATE TABLE test (id INTEGER)');
    validDb.run('INSERT INTO test VALUES (1)');
    const validBuffer = Buffer.from(validDb.export());
    validDb.close();

    const db = loadDatabaseWithRecovery({ SQL, buffer: validBuffer, logger });

    expect(db).toBeDefined();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();

    // Verify data is intact
    const stmt = db.prepare('SELECT * FROM test');
    stmt.step();
    expect(stmt.getAsObject()).toEqual({ id: 1 });
    stmt.free();
    db.close();
  });
});

describe('H8: history table retention', () => {
  test('provides SQL to delete rows beyond maxRows', () => {
    const result = historyRetentionSql(1000);

    expect(result.sql).toContain('DELETE FROM listen_history');
    expect(result.sql).toContain('ORDER BY id DESC');
    expect(result.params).toEqual([1000]);
  });

  test('uses default MAX_HISTORY_ROWS of 5000', () => {
    expect(MAX_HISTORY_ROWS).toBe(5000);

    const result = historyRetentionSql();
    expect(result.params).toEqual([5000]);
  });

  test('cleanup actually removes old rows keeping only maxRows', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('CREATE TABLE listen_history (id INTEGER PRIMARY KEY AUTOINCREMENT, song_id TEXT)');

    // Insert 10 rows
    for (let i = 0; i < 10; i++) {
      db.run('INSERT INTO listen_history (song_id) VALUES (?)', [`song-${i}`]);
    }

    // Keep only last 3
    const { sql, params } = historyRetentionSql(3);
    db.run(sql, params);

    const stmt = db.prepare('SELECT COUNT(*) as count FROM listen_history');
    stmt.step();
    const { count } = stmt.getAsObject();
    stmt.free();

    expect(count).toBe(3);

    // Verify the retained rows are the most recent ones
    const stmt2 = db.prepare('SELECT song_id FROM listen_history ORDER BY id');
    const retained = [];
    while (stmt2.step()) retained.push(stmt2.getAsObject().song_id);
    stmt2.free();
    expect(retained).toEqual(['song-7', 'song-8', 'song-9']);

    db.close();
  });
});
