import { fetchCwaDataset } from "@/lib/server/cwa/client";
import type { CwaUvIndexRecord } from "@/lib/server/cwa/queries";

// 氣象站每日紫外線指數最大值 (daily max UV index per station)
const RESOURCE_ID = "O-A0005-001";

interface RawLocation {
  StationID: string;
  UVIndex?: number;
}

interface RawRecords {
  weatherElement: { location: RawLocation[]; Date: string };
}

export async function fetchCwaUvIndex(): Promise<CwaUvIndexRecord[]> {
  const records = await fetchCwaDataset<RawRecords>(RESOURCE_ID);
  const date = records.weatherElement?.Date;
  if (!date) return [];

  return (records.weatherElement.location ?? [])
    .filter((loc) => loc.StationID)
    .map((loc) => ({
      stationId: loc.StationID,
      obsDate: date,
      uvIndex: loc.UVIndex ?? null,
    }));
}
