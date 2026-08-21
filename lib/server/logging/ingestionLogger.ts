import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import {
  withConnection,
  toSqlDateTime,
  utcNowSql,
} from "@/lib/server/db/mysql";

export const createIngestionRun = async (
  triggerType: string,
): Promise<number> =>
  withConnection(async (conn) => {
    const now = utcNowSql();
    const [result] = await conn.execute<ResultSetHeader>(
      `
      INSERT INTO ingest_runs (trigger_type, status, started_at, created_at, updated_at)
      VALUES (?, 'running', ?, ?, ?)
      `,
      [triggerType, now, now, now],
    );
    return result.insertId;
  });

export const finishIngestionRun = async (params: {
  runId: number;
  status: "success" | "failed";
  startedAt: Date;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedFeedsCount: number;
  summaryJson: string;
  errorMessage?: string;
}): Promise<void> => {
  await withConnection(async (conn) => {
    const endedAt = new Date();
    const endedAtSql = toSqlDateTime(endedAt);
    const durationMs = Math.max(
      0,
      endedAt.getTime() - params.startedAt.getTime(),
    );
    const now = utcNowSql();
    await conn.execute(
      `
      UPDATE ingest_runs
      SET status = ?, ended_at = ?, duration_ms = ?, fetched_count = ?, inserted_count = ?,
          updated_count = ?, unchanged_count = ?, failed_feeds_count = ?, summary_json = ?,
          error_message = ?, updated_at = ?
      WHERE id = ?
      `,
      [
        params.status,
        endedAtSql,
        durationMs,
        params.fetchedCount,
        params.insertedCount,
        params.updatedCount,
        params.unchangedCount,
        params.failedFeedsCount,
        params.summaryJson,
        params.errorMessage || null,
        now,
        params.runId,
      ],
    );
  });
};

export const writeIngestionError = async (params: {
  runId: number;
  feedCode?: string;
  url?: string;
  message: string;
  detail?: unknown;
}): Promise<void> => {
  await withConnection(async (conn) => {
    const now = utcNowSql();
    await conn.execute(
      `
      INSERT INTO ingest_errors (ingest_run_id, feed_code, url, message, detail_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        params.runId,
        params.feedCode || null,
        params.url || null,
        params.message,
        params.detail ? JSON.stringify(params.detail) : null,
        now,
      ],
    );
  });
};

export const getRecentRuns = async (limit = 20): Promise<RowDataPacket[]> =>
  withConnection(async (conn: PoolConnection) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT id, trigger_type, status, started_at, ended_at, duration_ms,
             fetched_count, inserted_count, updated_count, unchanged_count, failed_feeds_count,
             error_message
      FROM ingest_runs
      ORDER BY id DESC
      LIMIT ?
      `,
      [limit],
    );
    return rows;
  });
