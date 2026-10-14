import { fetchUsgsEarthquakes } from "@/lib/server/earthquakes/sources/usgs";
import { fetchEmscEarthquakes } from "@/lib/server/earthquakes/sources/emsc";
import { fetchHkoEarthquakes } from "@/lib/server/earthquakes/sources/hko";
import { fetchCwaEarthquakesAsIncoming } from "@/lib/server/earthquakes/sources/cwa";
import { upsertEarthquake } from "@/lib/server/earthquakes/queries";
import { meetsWriteThreshold } from "@/lib/server/earthquakes/writeThreshold";
import type { EarthquakeSource } from "@/lib/server/earthquakes/types";
import { runSource } from "@/lib/server/sync/runSource";

export interface EarthquakeSyncResult {
  sourceKey: EarthquakeSource;
  fetched: number;
  inserted: number;
  matched: number;
  /** Events dropped before insert for being below MIN_WRITE_MAGNITUDE (or having no reported magnitude) — see writeThreshold.ts. */
  skipped: number;
  error: string | null;
}

const SOURCES: { key: EarthquakeSource; fetch: () => Promise<Awaited<ReturnType<typeof fetchUsgsEarthquakes>>> }[] = [
  { key: "usgs", fetch: fetchUsgsEarthquakes },
  { key: "emsc", fetch: fetchEmscEarthquakes },
  { key: "hko", fetch: fetchHkoEarthquakes },
  { key: "cwa", fetch: fetchCwaEarthquakesAsIncoming },
];

const ZERO_COUNTS = { fetched: 0, inserted: 0, matched: 0, skipped: 0 };

export async function runEarthquakeSync(): Promise<EarthquakeSyncResult[]> {
  const results: EarthquakeSyncResult[] = [];

  for (const source of SOURCES) {
    results.push(
      await runSource(
        source.key,
        ZERO_COUNTS,
        async () => {
          const events = await source.fetch();
          let inserted = 0;
          let matched = 0;
          let skipped = 0;
          // Sequential, not batched — each event needs its own fuzzy-match
          // lookup against the current state of the table (including rows
          // this same loop just inserted), so a bulk upsert doesn't apply here.
          for (const event of events) {
            // Write threshold (issue #582): drop sub-M2.5/no-magnitude
            // events before they ever reach the fuzzy-match query or an
            // INSERT — see writeThreshold.ts for why.
            if (!meetsWriteThreshold(event.magnitude)) {
              skipped++;
              continue;
            }
            const outcome = await upsertEarthquake(event);
            if (outcome === "inserted") inserted++;
            else matched++;
          }
          return { fetched: events.length, inserted, matched, skipped };
        },
        "Unknown earthquake sync error",
      ),
    );
  }

  return results;
}
