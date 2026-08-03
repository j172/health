import { withConnection, utcNowSql } from "@/lib/server/db/mysql";

const BATCH_SIZE = 500;

/**
 * Runs a chunked `INSERT ... VALUES ? ON DUPLICATE KEY UPDATE ...` upsert over
 * `records`, batching into groups of BATCH_SIZE rows per round-trip — several
 * of our sources run to tens or hundreds of thousands of rows, and one
 * round-trip per row doesn't scale.
 *
 * `toRow` converts one record (plus the shared `now` timestamp string) into
 * the positional values for a single VALUES row; `tableSql` is the full
 * `INSERT ... VALUES ? ON DUPLICATE KEY UPDATE ...` statement for the target
 * table.
 *
 * Relies on MySQL's upsert convention: affectedRows = 1 per newly-inserted
 * row + 2 per updated row, so inserted/updated can be derived from the chunk
 * size and the driver's affectedRows count without a second query.
 */
export const chunkedUpsert = async <T>(
  records: T[],
  tableSql: string,
  toRow: (record: T, now: string) => unknown[],
): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    let inserted = 0;
    let updated = 0;
    const now = utcNowSql();

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const chunk = records.slice(i, i + BATCH_SIZE);
      if (chunk.length === 0) continue;
      const values = chunk.map((record) => toRow(record, now));
      const [result] = await conn.query(tableSql, [values]);
      const affected = (result as { affectedRows: number }).affectedRows;
      const chunkUpdated = affected - chunk.length;
      updated += chunkUpdated;
      inserted += chunk.length - chunkUpdated;
    }

    return { inserted, updated };
  });
