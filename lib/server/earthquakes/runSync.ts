import { fetchUsgsEarthquakes } from "@/lib/server/earthquakes/sources/usgs";
import { fetchEmscEarthquakes } from "@/lib/server/earthquakes/sources/emsc";
import { fetchHkoEarthquakes } from "@/lib/server/earthquakes/sources/hko";
import { upsertEarthquake } from "@/lib/server/earthquakes/queries";
import type { EarthquakeSource } from "@/lib/server/earthquakes/types";
import { runSource } from "@/lib/server/sync/runSource";

export interface EarthquakeSyncResult {
  sourceKey: EarthquakeSource;
  fetched: number;
  inserted: number;
  matched: number;
  error: string | null;
}

const SOURCES: { key: EarthquakeSource; fetch: () => Promise<Awaited<ReturnType<typeof fetchUsgsEarthquakes>>> }[] = [
  { key: "usgs", fetch: fetchUsgsEarthquakes },
  { key: "emsc", fetch: fetchEmscEarthquakes },
  { key: "hko", fetch: fetchHkoEarthquakes },
];

const ZERO_COUNTS = { fetched: 0, inserted: 0, matched: 0 };

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
          // Sequential, not batched — each event needs its own fuzzy-match
          // lookup against the current state of the table (including rows
          // this same loop just inserted), so a bulk upsert doesn't apply here.
          for (const event of events) {
            const outcome = await upsertEarthquake(event);
            if (outcome === "inserted") inserted++;
            else matched++;
          }
          return { fetched: events.length, inserted, matched };
        },
        "Unknown earthquake sync error",
      ),
    );
  }

  return results;
}
