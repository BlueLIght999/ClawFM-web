/**
 * historyRetention — SQL rules for capping listen_history table growth.
 *
 * Problem (H8): `listen_history` grew indefinitely; after months of use
 * the table could contain hundreds of thousands of rows, slowing queries
 * and bloating the DB file.
 *
 * Solution: periodically delete rows beyond a maximum, keeping only the
 * most recent entries (by id).
 */

export const MAX_HISTORY_ROWS = 5000;

/**
 * Build the SQL + params to trim listen_history to the most recent `maxRows` entries.
 *
 * @param {number} [maxRows=MAX_HISTORY_ROWS] - Number of most recent rows to keep.
 * @returns {{ sql: string, params: number[] }}
 */
export function historyRetentionSql(maxRows = MAX_HISTORY_ROWS) {
  return {
    sql: 'DELETE FROM listen_history WHERE id NOT IN (SELECT id FROM listen_history ORDER BY id DESC LIMIT ?)',
    params: [maxRows],
  };
}
