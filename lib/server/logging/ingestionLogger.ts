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

/**
 * A run older than this that is still marked `running` cannot be running.
 * Real runs take about eight minutes; the ceiling is generous on purpose.
 * Lowered from 45 to 20 on 2026-09-22 (issue #391 investigation) — a full
 * run now takes ~11 minutes with the added sources, so 20 still leaves
 * roughly a 2x buffer while surfacing genuinely abandoned rows sooner.
 */
const ORPHAN_RUN_AFTER_MINUTES = 20;

/**
 * Marks abandoned runs as aborted.
 *
 * finishIngestionRun() is the only thing that moves a row off `running`, so any
 * run whose process died first — a PM2 restart mid-deploy is the usual way —
 * stays `running` forever and quietly poisons the history: three such rows
 * accumulated in one afternoon of deploys, and each one makes the run list look
 * like ingestion is currently in flight when nothing is.
 */
const reapOrphanedRuns = async (
  conn: PoolConnection,
  currentRunId: number,
): Promise<void> => {
  await conn.execute(
    `
    UPDATE ingest_runs
    SET status = 'failed',
        error_message = COALESCE(error_message, 'Abandoned — process exited before the run finished (usually a deploy restart).'),
        ended_at = UTC_TIMESTAMP(),
        updated_at = UTC_TIMESTAMP()
    WHERE status = 'running'
      AND id <> ?
      AND COALESCE(updated_at, started_at) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
    `,
    [currentRunId, ORPHAN_RUN_AFTER_MINUTES],
  );
};

/**
 * Tells the run list "this run is alive" by moving updated_at forward.
 *
 * The orphan rule above is about *silence*, not age: a row is abandoned when
 * nothing has touched it for ORPHAN_RUN_AFTER_MINUTES. It used to be measured
 * from started_at, so a run that was healthy but slow (the host is shared and
 * loaded; a full ingestion is ~11 minutes on a good day) was reaped as
 * "Abandoned" by whichever sync started next, while it was still working.
 * Every other sync never touches its row, and updated_at starts equal to
 * started_at, so for them nothing changes. The window itself is not widened.
 */
export const touchIngestionRun = async (runId: number): Promise<void> => {
  await withConnection(async (conn) => {
    await conn.execute(
      `UPDATE ingest_runs SET updated_at = ? WHERE id = ? AND status = 'running'`,
      [utcNowSql(), runId],
    );
  });
};

/**
 * Records an attempt that did not run because another run of the same job holds
 * its advisory lock. This is the normal outcome whenever two triggers overlap
 * (the in-app cron and the GitHub heartbeat both start an RSS run, and a run
 * outlives the gap between them), so it is stored as its own quiet status rather
 * than as a failure: counting it in `failed` made the run list read as a string
 * of errors when nothing had gone wrong.
 */
export const recordSkippedIngestionRun = async (params: {
  triggerType: string;
  reason: string;
  startedAt: Date;
}): Promise<number> =>
  withConnection(async (conn) => {
    const now = utcNowSql();
    const [result] = await conn.execute<ResultSetHeader>(
      `
      INSERT INTO ingest_runs
        (trigger_type, status, started_at, ended_at, duration_ms, summary_json, created_at, updated_at)
      VALUES (?, 'skipped', ?, ?, ?, ?, ?, ?)
      `,
      [
        params.triggerType,
        toSqlDateTime(params.startedAt),
        now,
        Math.max(0, Date.now() - params.startedAt.getTime()),
        JSON.stringify({ skipped: params.reason }),
        now,
        now,
      ],
    );
    return result.insertId;
  });

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
    await reapOrphanedRuns(conn, result.insertId);
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

export interface RecentRunFilters {
  /** Skip this many of the newest matching runs — the list used to stop at the latest 20 with no way back. */
  offset?: number;
  /** Only runs with this status: running | success | failed | skipped. */
  status?: string;
  /** Only runs started by this trigger: internal-cron | admin-manual | ... */
  triggerType?: string;
}

export const getRecentRuns = async (
  limit = 20,
  filters: RecentRunFilters = {},
): Promise<RowDataPacket[]> =>
  withConnection(async (conn: PoolConnection) => {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (filters.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }
    if (filters.triggerType) {
      conditions.push("trigger_type = ?");
      params.push(filters.triggerType);
    }
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT id, trigger_type, status, started_at, ended_at, duration_ms,
             fetched_count, inserted_count, updated_count, unchanged_count, failed_feeds_count,
             error_message, summary_json
      FROM ingest_runs
      ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, Math.max(0, filters.offset ?? 0)],
    );
    return rows;
  });
