import { fetchCwaDataset } from "@/lib/server/cwa/client";
import type { CwaForecastRecord } from "@/lib/server/cwa/queries";

// 三十六小時天氣預報 (36-hour weather forecast, per county)
const RESOURCE_ID = "F-C0032-001";

interface RawTimeEntry {
  startTime: string;
  endTime: string;
  parameter?: { parameterName?: string; parameterValue?: string; parameterUnit?: string };
}

interface RawWeatherElement {
  elementName: string;
  time: RawTimeEntry[];
}

interface RawLocation {
  locationName: string;
  weatherElement: RawWeatherElement[];
}

interface RawRecords {
  location: RawLocation[];
}

export async function fetchCwaForecasts(): Promise<CwaForecastRecord[]> {
  const records = await fetchCwaDataset<RawRecords>(RESOURCE_ID);
  const rows: CwaForecastRecord[] = [];

  for (const location of records.location ?? []) {
    for (const element of location.weatherElement ?? []) {
      for (const time of element.time ?? []) {
        rows.push({
          countyName: location.locationName,
          elementName: element.elementName,
          startTime: time.startTime,
          endTime: time.endTime,
          parameterName: time.parameter?.parameterName ?? null,
          parameterValue: time.parameter?.parameterValue ?? null,
          parameterUnit: time.parameter?.parameterUnit ?? null,
        });
      }
    }
  }

  return rows;
}
