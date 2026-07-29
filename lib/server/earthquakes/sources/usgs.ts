import { httpGetText } from "@/lib/server/net/httpClient";
import type { IncomingEarthquake } from "@/lib/server/earthquakes/types";
import { toMysqlDatetimeUtc } from "@/lib/server/earthquakes/types";

// USGS all-earthquakes-past-hour feed — a 1-hour window comfortably overlaps
// between 5-minute polls, so nothing is missed even if a poll is delayed.
const SOURCE_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

interface UsgsFeature {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    url: string | null;
    tsunami: number;
    magType: string | null;
  };
  geometry: { coordinates: [number, number, number] };
}

interface UsgsResponse {
  features: UsgsFeature[];
}

export async function fetchUsgsEarthquakes(): Promise<IncomingEarthquake[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`USGS earthquake feed request failed: HTTP ${status}`);

  let data: UsgsResponse;
  try {
    data = JSON.parse(text);
  } catch (error) {
    console.error(`USGS parse failed: typeof=${typeof text}, length=${(text as unknown as string)?.length}, head=${JSON.stringify(text).slice(0, 300)}`);
    throw error;
  }

  return data.features.map((f): IncomingEarthquake => ({
    source: "usgs",
    sourceEventId: f.id,
    eventTime: toMysqlDatetimeUtc(new Date(f.properties.time)),
    magnitude: f.properties.mag,
    magnitudeType: f.properties.magType,
    depthKm: f.geometry.coordinates[2] ?? null,
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    place: f.properties.place,
    placeZh: null,
    tsunamiWarning: f.properties.tsunami === 1,
    url: f.properties.url,
  }));
}
