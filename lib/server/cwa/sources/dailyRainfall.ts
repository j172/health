import { fetchCwaDataset } from "@/lib/server/cwa/client";

/**
 * 每日雨量觀測 (C-B0025-001) — the daily accumulation history behind the
 * real-time gauge readings in cwa_rainfall.
 *
 * 38 署屬有人氣象站, one entry per station per day, running from the start of the
 * year. The real-time dataset answers "is it raining now"; this one answers
 * "has this been a wet month", and neither substitutes for the other.
 *
 * Only `Precipitation` is carried across. The payload's weatherElements holds
 * nothing else, and inventing columns for fields that do not arrive is how you
 * end up with a table full of NULLs nobody can interpret later.
 */

const RESOURCE_ID = "C-B0025-001";

interface RawObsTime {
  Date?: string;
  weatherElements?: { Precipitation?: string };
}

interface RawLocation {
  station?: { StationID?: string; StationName?: string };
  stationObsTimes?: { stationObsTime?: RawObsTime[] };
}

interface RawRecords {
  location?: RawLocation[];
}

export interface CwaDailyRainfallRecord {
  stationId: string;
  stationName: string | null;
  obsDate: string;
  precipitation: number | null;
}

/**
 * CWA uses sentinel strings in this field rather than nulls: "T" for a trace
 * amount too small to measure, and negative markers for no observation. A trace
 * becomes 0 (it did rain, but unmeasurably); a missing reading becomes null.
 */
const parsePrecipitation = (value: string | undefined): number | null => {
  const raw = (value ?? "").trim();
  if (raw === "") return null;
  if (raw.toUpperCase() === "T") return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

export async function fetchCwaDailyRainfall(): Promise<
  CwaDailyRainfallRecord[]
> {
  const records = await fetchCwaDataset<RawRecords>(RESOURCE_ID);
  const rows: CwaDailyRainfallRecord[] = [];

  for (const location of records?.location ?? []) {
    const stationId = (location.station?.StationID ?? "").trim();
    if (!stationId) continue;
    const stationName = (location.station?.StationName ?? "").trim() || null;

    for (const entry of location.stationObsTimes?.stationObsTime ?? []) {
      const obsDate = (entry.Date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(obsDate)) continue;

      rows.push({
        stationId,
        stationName,
        obsDate,
        precipitation: parsePrecipitation(entry.weatherElements?.Precipitation),
      });
    }
  }

  return rows;
}
