import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { yieldToEventLoop } from "@/lib/server/sync/yieldToEventLoop";

const BATCH_SIZE = 500;

export interface ChunkedUpsertOptions {
  /** Rows per INSERT statement. Defaults to 500. */
  batchSize?: number;
  /**
   * Hand control back to the event loop after every batch. Off by default (the
   * existing callers' behaviour is unchanged); turn it on for large imports that run
   * inside the web process, where building each statement is a few milliseconds of
   * synchronous work that would otherwise run back to back.
   */
  yieldBetweenBatches?: boolean;
  /** Called after each batch with the running totals (used for progress / memory logging). */
  onBatch?: (progress: { batch: number; rowsDone: number; rowsTotal: number }) => void;
}

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
  options: ChunkedUpsertOptions = {},
): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    const batchSize = Math.max(1, options.batchSize ?? BATCH_SIZE);
    let inserted = 0;
    let updated = 0;
    let batch = 0;
    const now = utcNowSql();

    for (let i = 0; i < records.length; i += batchSize) {
      const chunk = records.slice(i, i + batchSize);
      if (chunk.length === 0) continue;
      const values = chunk.map((record) => toRow(record, now));
      const [result] = await conn.query(tableSql, [values]);
      const affected = (result as { affectedRows: number }).affectedRows;
      const chunkUpdated = affected - chunk.length;
      updated += chunkUpdated;
      inserted += chunk.length - chunkUpdated;

      batch += 1;
      options.onBatch?.({ batch, rowsDone: Math.min(i + chunk.length, records.length), rowsTotal: records.length });
      if (options.yieldBetweenBatches) await yieldToEventLoop();
    }

    return { inserted, updated };
  });
