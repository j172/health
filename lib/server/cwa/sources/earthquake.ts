import { fetchCwaDataset } from "@/lib/server/cwa/client";
import type { CwaEarthquakeRecord } from "@/lib/server/cwa/queries";

// 地震報告 (significant earthquake reports)
const RESOURCE_ID = "E-A0015-001";

interface RawShakingArea {
  AreaDesc?: string;
  CountyName?: string;
  AreaIntensity?: string;
}

interface RawEarthquake {
  EarthquakeNo: number;
  ReportType?: string;
  ReportColor?: string;
  ReportContent?: string;
  ReportImageURI?: string;
  Web?: string;
  EarthquakeInfo?: {
    OriginTime?: string;
    FocalDepth?: number;
    Epicenter?: { Location?: string; EpicenterLatitude?: number; EpicenterLongitude?: number };
    EarthquakeMagnitude?: { MagnitudeType?: string; MagnitudeValue?: number };
  };
  Intensity?: { ShakingArea?: RawShakingArea[] };
}

interface RawRecords {
  Earthquake: RawEarthquake[];
}

// CWA's intensity scale isn't purely numeric (5弱/5強, 6弱/6強 sit between the
// integer levels), so a plain string/numeric sort would misorder them —
// weight 弱/強 as fractional steps to compare correctly.
const intensityRank = (value: string | undefined): number => {
  if (!value) return -1;
  const match = value.match(/(\d+)(弱|強)?/);
  if (!match) return -1;
  const base = Number(match[1]);
  const suffix = match[2] === "強" ? 0.5 : 0;
  return base + suffix;
};

export async function fetchCwaEarthquakes(): Promise<CwaEarthquakeRecord[]> {
  const records = await fetchCwaDataset<RawRecords>(RESOURCE_ID);

  return (records.Earthquake ?? []).map((eq) => {
    const areas = eq.Intensity?.ShakingArea ?? [];
    const maxArea = areas.reduce<RawShakingArea | null>((max, area) => (intensityRank(area.AreaIntensity) > intensityRank(max?.AreaIntensity) ? area : max), null);

    return {
      earthquakeNo: eq.EarthquakeNo,
      reportType: eq.ReportType ?? null,
      reportColor: eq.ReportColor ?? null,
      originTime: eq.EarthquakeInfo?.OriginTime ?? null,
      location: eq.EarthquakeInfo?.Epicenter?.Location ?? null,
      epicenterLat: eq.EarthquakeInfo?.Epicenter?.EpicenterLatitude ?? null,
      epicenterLng: eq.EarthquakeInfo?.Epicenter?.EpicenterLongitude ?? null,
      focalDepth: eq.EarthquakeInfo?.FocalDepth ?? null,
      magnitudeValue: eq.EarthquakeInfo?.EarthquakeMagnitude?.MagnitudeValue ?? null,
      magnitudeType: eq.EarthquakeInfo?.EarthquakeMagnitude?.MagnitudeType ?? null,
      maxIntensity: maxArea?.AreaIntensity ?? null,
      reportContent: eq.ReportContent ?? null,
      reportImageUri: eq.ReportImageURI ?? null,
      web: eq.Web ?? null,
      areaIntensityJson: areas.length > 0 ? areas : null,
    };
  });
}
