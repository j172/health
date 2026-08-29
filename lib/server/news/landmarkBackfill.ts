import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { withAdvisoryLock } from "@/lib/server/db/mysql";
import { extractLocationFromText } from "./geoExtractor";
import {
  isNewFacilityMatch,
  planLandmarkTransition,
  type LandmarkTransition,
  type StoredLandmark,
} from "./landmarkTransition";

/**
 * Re-applies the current landmark rules (#65 uniqueness, #78 the 368-district
 * table, #71 chrome scoping) to `news_items` rows that already hold a landmark.
 *
 * Why this exists at all: none of the three normal write paths can reach these
 * rows. `persistItems.ts` skips extraction entirely when `payload_hash` is
 * unchanged, and both `runNewsGeocodeBatch` and `cardImages.ts` select on
 * `lat IS NULL` — while every affected row holds a non-null, wrong `lat`.
 * See docs/specs/news-landmark-backfill.md.
 *
 * Three properties are load-bearing, not preferences:
 *
 *  1. **No outbound HTTP.** The pass re-runs `extractLocationFromText` over the
 *     `title` + `detail_text`/`description_text` *already stored*. Detail pages
 *     are never re-fetched: that load is what caused the 2026-08-29 outage.
 *
 *  2. **External geocoding stays off.** `extractLocationFromText` is called with
 *     `allowExternalGeocode = false`, which is the sole guard on the only branch
 *     in `geoExtractor.ts` that reaches `queryOpenCage`/`queryNominatim`. Tier 4
 *     shares one daily budget and circuit breaker with the facilities geocode
 *     batch (`lib/server/facilities/geocodeBudget.ts`); a multi-thousand-row pass
 *     reaching it would drain the day's quota in one go and silently stall
 *     facility geocoding.
 *
 *  3. **Dry run is the default.** Writing requires `dryRun: false` explicitly.
 *
 * Accepted consequence: rows whose `detail_text` was scraped before #71 still
 * contain publisher chrome, including the CWA's 368-district SVG enumeration.
 * Those rows do not become *correct*, they become *silent* — a saturated text now
 * yields `null` instead of an arbitrary first-array-hit. That is the right
 * direction and most of the available win; re-scraping them is out of scope.
 */

const DEFAULT_LIMIT = 100;
const MAX_SAMPLES = 20;

export interface NewsLandmarkBackfillOptions {
  /** Rows to examine in this call. */
  limit?: number;
  /** Resume cursor: only rows with `id > afterId` are examined. See `cursor` below. */
  afterId?: number;
  /** Defaults to `true`. A live run must pass `false` explicitly. */
  dryRun?: boolean;
}

export interface LandmarkTransitionSample {
  id: number;
  title: string;
  transition: string;
  fromLocationName: string | null;
  toLocationName: string | null;
}

export interface NewsLandmarkBackfillSummary {
  dryRun: boolean;
  scanned: number;
  unchanged: number;
  changed: number;
  cleared: number;
  /** Rows actually written. Always 0 on a dry run; otherwise `changed + cleared`. */
  updated: number;
  /**
   * Subset of `changed` whose new value comes from tier 1. Broken out because the
   * `facilities` table has grown since many rows were ingested, so these rows are
   * NOT "the new rules disagreeing" — they are a row matching a hospital it could
   * not match before. An improvement, but it means this is not a pure
   * "apply the new rules" pass, and the operator should see its size.
   */
  newFacilityMatches: number;
  /** `{ "county->null": 12, "district->county": 4, … }` — changed/cleared rows only. */
  byTransition: Record<string, number>;
  /** Up to 20 changed/cleared rows, so a dry run is legible without a DB client. */
  samples: LandmarkTransitionSample[];
  /**
   * Resume state. Pass `next` back as `afterId` on the following call; `exhausted`
   * is true once a call returns fewer rows than `limit`, i.e. the table is done.
   */
  cursor: { afterId: number; next: number | null; exhausted: boolean };
  skippedLock?: boolean;
}

/** mysql2 hands `DECIMAL` back as a string; the static centroid tables are numbers. */
function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptySummary(
  dryRun: boolean,
  afterId: number,
): NewsLandmarkBackfillSummary {
  return {
    dryRun,
    scanned: 0,
    unchanged: 0,
    changed: 0,
    cleared: 0,
    updated: 0,
    newFacilityMatches: 0,
    byTransition: {},
    samples: [],
    cursor: { afterId, next: null, exhausted: false },
  };
}

async function applyTransition(
  conn: PoolConnection,
  id: number,
  transition: LandmarkTransition,
): Promise<void> {
  // All four columns move together, and nothing else is touched. In particular
  // `geocode_attempts` is NOT incremented: this is a re-extraction of text we
  // already hold, not a geocoding attempt, and inflating that counter would push
  // rows past the `geocode_attempts < 3` gate that `runNewsGeocodeBatch` uses.
  await conn.query(
    `
    UPDATE news_items
    SET lat = ?, lng = ?, location_name = ?, facility_id = ?
    WHERE id = ?
    `,
    [
      transition.next?.lat ?? null,
      transition.next?.lng ?? null,
      transition.next?.locationName ?? null,
      transition.next?.facilityId ?? null,
      id,
    ],
  );
}

/**
 * Runs one batch of the landmark backfill.
 *
 * Resumability: rows are selected by `WHERE id > afterId ORDER BY id ASC`, and the
 * summary returns the highest id it examined as `cursor.next`. Feeding that back in
 * means a settled row is never looked at twice, which `ORDER BY … LIMIT` alone
 * cannot give — the batch's own writes do not change a row's eligibility, so an
 * offset-free re-run would rescan the same head of the table forever. The cursor
 * is used rather than a marker column because a dry run must write nothing, and a
 * marker column would leave dry runs stuck on the first batch.
 */
export async function runNewsLandmarkBackfill(
  options: NewsLandmarkBackfillOptions = {},
): Promise<NewsLandmarkBackfillSummary> {
  const limit = Math.min(500, Math.max(1, Math.trunc(options.limit ?? DEFAULT_LIMIT)));
  const afterId = Math.max(0, Math.trunc(options.afterId ?? 0));
  const dryRun = options.dryRun !== false;

  const lockResult = await withAdvisoryLock(
    "news_landmark_backfill_lock",
    2,
    async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `
        SELECT id, title, description_text, detail_text,
               lat, lng, location_name, facility_id
        FROM news_items
        WHERE id > ?
          AND (lat IS NOT NULL OR location_name IS NOT NULL OR facility_id IS NOT NULL)
        ORDER BY id ASC
        LIMIT ?
        `,
        [afterId, limit],
      );

      const summary = emptySummary(dryRun, afterId);
      summary.scanned = rows.length;
      summary.cursor.exhausted = rows.length < limit;

      for (const row of rows) {
        const id = Number(row.id);
        summary.cursor.next = id;

        const title = String(row.title || "");
        const content = String(row.detail_text || row.description_text || "");
        const stored: StoredLandmark = {
          lat: toNumberOrNull(row.lat),
          lng: toNumberOrNull(row.lng),
          locationName: row.location_name != null ? String(row.location_name) : null,
          facilityId: row.facility_id != null ? Number(row.facility_id) : null,
        };

        // `false` is the no-external-geocoding guard (see the file header).
        // `conn` is passed so tier 1's `facilities` lookup reuses this locked
        // connection instead of taking a second slot from an 8-slot pool.
        const extracted = await extractLocationFromText(
          title,
          content,
          false,
          conn,
        );

        const transition = planLandmarkTransition(stored, extracted);
        if (transition.outcome === "unchanged") {
          summary.unchanged += 1;
          continue;
        }

        if (transition.outcome === "cleared") summary.cleared += 1;
        else summary.changed += 1;
        if (isNewFacilityMatch(transition)) summary.newFacilityMatches += 1;

        summary.byTransition[transition.transition] =
          (summary.byTransition[transition.transition] ?? 0) + 1;

        if (summary.samples.length < MAX_SAMPLES) {
          summary.samples.push({
            id,
            title: title.slice(0, 120),
            transition: transition.transition,
            fromLocationName: stored.locationName,
            toLocationName: transition.next?.locationName ?? null,
          });
        }

        if (!dryRun) {
          await applyTransition(conn, id, transition);
          summary.updated += 1;
        }
      }

      return summary;
    },
  );

  if (!lockResult.acquired) {
    return { ...emptySummary(dryRun, afterId), skippedLock: true };
  }

  return lockResult.result;
}
