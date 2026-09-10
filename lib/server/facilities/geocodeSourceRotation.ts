import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { utcNowSql } from "@/lib/server/db/mysql";

/**
 * Round-robin fairness for the unified geocode batch job
 * (see lib/server/facilities/geocodeBatch.ts). MAX_FACILITIES_PER_INVOCATION
 * caps every invocation to a handful of facility rows total across 22
 * sources (SOURCES_IN_PRIORITY) — without rotation, a single high-backlog
 * source parked early in that array can consume every invocation's entire
 * budget indefinitely, starving every source behind it (confirmed 2026-09-09:
 * iaq_premise/cleaning_squad/green_hotel sat at 0 geocoded rows for days and
 * had to be manually reordered to the front of the array as a stopgap — see
 * that entry's own comment in geocodeBatch.ts).
 *
 * This persists "which source was last visited" across invocations/deploys
 * (DB-backed for the same restart-safety reason as geocodeBudget.ts — the
 * in-app process restarts on every deploy) so each invocation resumes the
 * rotation where the last one left off instead of always restarting from
 * SOURCES_IN_PRIORITY[0].
 */

const ROTATION_KEY = "geocode_batch_source_rotation_v1";

interface RotationRow extends RowDataPacket {
  last_source_key: string;
}

export interface RotationSource {
  facilityType: string;
  sourceKey: string;
}

const sourceIdentity = (source: RotationSource): string => `${source.facilityType}:${source.sourceKey}`;

/**
 * Reorders `sources` to start right after whichever one was last visited,
 * wrapping around — pure so it's independently testable without a DB. Falls
 * back to the original order if there's no stored cursor yet, or the stored
 * key no longer identifies any current source (one was removed/renamed since).
 */
export function rotateSourcesFrom<T extends RotationSource>(sources: T[], lastVisitedKey: string | null): T[] {
  if (!lastVisitedKey || sources.length === 0) return sources;
  const lastIndex = sources.findIndex((s) => sourceIdentity(s) === lastVisitedKey);
  if (lastIndex === -1) return sources;
  const startIndex = (lastIndex + 1) % sources.length;
  return [...sources.slice(startIndex), ...sources.slice(0, startIndex)];
}

/** Loads the persisted rotation cursor and returns `sources` reordered to resume from it. */
export const loadRotatedSources = async <T extends RotationSource>(conn: PoolConnection, sources: T[]): Promise<T[]> => {
  const [rows] = await conn.query<RotationRow[]>("SELECT last_source_key FROM geocode_source_rotation WHERE rotation_key = ?", [ROTATION_KEY]);
  return rotateSourcesFrom(sources, rows[0]?.last_source_key ?? null);
};

/** Persists `lastVisited` as where this invocation's rotation stopped, so the next invocation resumes right after it. */
export const saveRotationCursor = async (conn: PoolConnection, lastVisited: RotationSource): Promise<void> => {
  await conn.execute<ResultSetHeader>(
    `
    INSERT INTO geocode_source_rotation (rotation_key, last_source_key, updated_at)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      last_source_key = VALUES(last_source_key),
      updated_at = VALUES(updated_at)
    `,
    [ROTATION_KEY, sourceIdentity(lastVisited), utcNowSql()],
  );
};
