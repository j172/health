/**
 * Office-calendar sync (issue #691): data.gov.tw 14718 《中華民國政府行政機關辦公日曆表》
 * → office_calendar_days, for this year and next year.
 *
 * The decisions (which years, which file, what is refused) live in syncCore.ts;
 * this file is only the wiring: data.gov.tw metadata and the DGPA CSV over
 * `lib/server/net/httpClient` (never the global fetch — undici's WASM parser
 * runs out of memory on this host), the table upsert, one MySQL advisory lock so
 * an overrunning run is skipped instead of raced, and ingest_runs /
 * ingest_errors so a failure is visible.
 *
 * Egress: the CSV links point at www.dgpa.gov.tw, which has not yet been
 * confirmed reachable from the production host (the probe was added to
 * egress-probe.yml in the same PR). If it is blocked, this job fails loudly
 * into ingest_errors and the page keeps working from the committed seed
 * (data/office-calendar-seed.json) — see calendarSource.ts.
 */
import { withAdvisoryLock } from "@/lib/server/db/mysql";
import { createIngestionRun, finishIngestionRun, writeIngestionError } from "@/lib/server/logging/ingestionLogger";
import { httpGetJson, httpRequest } from "@/lib/server/net/httpClient";
import { OFFICE_CALENDAR_DATASET_API } from "./datasetResources";
import { syncOfficeCalendar, type OfficeCalendarSyncResult } from "./syncCore";
import { upsertOfficeCalendarYear } from "./queries";

const SYNC_LOCK_NAME = "office_calendar_sync_lock";
export const OFFICE_CALENDAR_FEED_CODE = "office-calendar-14718";

/** A yearly file is ~7 KB; anything near this cap is not the file we expect. */
const MAX_CSV_BYTES = 1024 * 1024;

const fetchMetadata = async (): Promise<unknown> => {
  const { status, data } = await httpGetJson(OFFICE_CALENDAR_DATASET_API, {
    timeoutMs: 25_000,
    maxResponseBytes: 2 * 1024 * 1024,
    headers: { Accept: "application/json" },
  });
  if (status < 200 || status >= 300) {
    throw new Error(`data.gov.tw 14718 metadata request failed with status ${status}`);
  }
  return data;
};

const fetchCsv = async (url: string): Promise<Uint8Array> => {
  const response = await httpRequest(url, {
    timeoutMs: 25_000,
    maxResponseBytes: MAX_CSV_BYTES,
    headers: { Accept: "text/csv, text/plain, */*" },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Office calendar CSV download failed with status ${response.status}`);
  }
  return response.buffer;
};

/**
 * Runs the sync under an advisory lock. Never throws: failures land in
 * ingest_errors and in the returned result.
 */
export async function runOfficeCalendarSync(): Promise<OfficeCalendarSyncResult> {
  const startedAt = new Date();
  const runId = await createIngestionRun("office-calendar-weekly-cron");

  const lockResult = await withAdvisoryLock(SYNC_LOCK_NAME, 1, async () => {
    let result: OfficeCalendarSyncResult;
    try {
      result = await syncOfficeCalendar({
        fetchMetadata,
        fetchCsv,
        upsertYear: upsertOfficeCalendarYear,
        now: () => new Date(),
      });
    } catch (error) {
      result = { years: [], error: error instanceof Error ? error.message : "Unknown office-calendar sync error" };
    }

    const failedYears = result.years.filter((year) => year.status === "failed");
    const problems = [
      ...(result.error ? [result.error] : []),
      ...failedYears.map((year) => `${year.year}: ${year.error}`),
    ];
    for (const message of problems) {
      await writeIngestionError({ runId, feedCode: OFFICE_CALENDAR_FEED_CODE, message });
    }

    const totals = result.years.reduce(
      (acc, year) => ({
        fetched: acc.fetched + year.rows,
        inserted: acc.inserted + year.inserted,
        updated: acc.updated + year.updated,
      }),
      { fetched: 0, inserted: 0, updated: 0 },
    );

    await finishIngestionRun({
      runId,
      status: problems.length === 0 ? "success" : "failed",
      startedAt,
      fetchedCount: totals.fetched,
      insertedCount: totals.inserted,
      updatedCount: totals.updated,
      unchangedCount: Math.max(0, totals.fetched - totals.inserted - totals.updated),
      failedFeedsCount: problems.length,
      summaryJson: JSON.stringify({ source: "office-calendar", ...result }),
      errorMessage: problems.length > 0 ? problems.join("; ") : undefined,
    });

    return result;
  });

  if (!lockResult.acquired) {
    await finishIngestionRun({
      runId,
      status: "failed",
      startedAt,
      fetchedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedFeedsCount: 0,
      summaryJson: JSON.stringify({ source: "office-calendar", skipped: "lock_held" }),
      errorMessage: "Another office-calendar sync is currently running.",
    });
    return { years: [], error: null };
  }

  return lockResult.result;
}
