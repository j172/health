import { fetchCwaDataset } from "@/lib/server/cwa/client";
import type { CwaTownshipHazardRecord } from "@/lib/server/cwa/queries";

// 天氣特報-鄉鎮天氣現象及危害 (township-level hazard conditions) — usually an
// empty hazards[] per township when nothing is active, non-empty only during
// an actual event.
const RESOURCE_ID = "W-C0033-001";

interface RawHazard {
  phenomena?: string;
  significance?: string;
  startTime?: string;
  endTime?: string;
}

interface RawLocation {
  locationName: string;
  geocode?: number | string;
  hazardConditions?: { hazards?: RawHazard[] };
}

interface RawRecords {
  location: RawLocation[];
}

export async function fetchCwaTownshipHazards(): Promise<CwaTownshipHazardRecord[]> {
  const records = await fetchCwaDataset<RawRecords>(RESOURCE_ID);
  const rows: CwaTownshipHazardRecord[] = [];

  for (const location of records.location ?? []) {
    for (const hazard of location.hazardConditions?.hazards ?? []) {
      if (!hazard.phenomena || !hazard.startTime) continue;
      rows.push({
        locationName: location.locationName,
        geocode: location.geocode != null ? String(location.geocode) : null,
        phenomena: hazard.phenomena,
        significance: hazard.significance ?? null,
        startTime: hazard.startTime,
        endTime: hazard.endTime ?? null,
      });
    }
  }

  return rows;
}
