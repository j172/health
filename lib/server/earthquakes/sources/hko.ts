import { httpGetText } from "@/lib/server/net/httpClient";
import type { IncomingEarthquake } from "@/lib/server/earthquakes/types";
import { toMysqlDatetimeUtc } from "@/lib/server/earthquakes/types";

// Hong Kong Observatory "Quick Earthquake Message" — unlike USGS/EMSC this
// returns a single object (the latest notable/significant quake, roughly
// M6+), not a list, and carries no persistent event ID of its own. Its main
// value here is the Traditional Chinese region name (place_zh), merged into
// whatever USGS/EMSC row matches the same event.
const SOURCE_URL = "https://data.weather.gov.hk/weatherAPI/opendata/earthquake.php?dataType=qem&lang=tc";

interface HkoResponse {
  lat?: number;
  lon?: number;
  mag?: number;
  region?: string;
  ptime?: string;
}

export async function fetchHkoEarthquakes(): Promise<IncomingEarthquake[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`HKO earthquake feed request failed: HTTP ${status}`);
  if (!text.trim()) return [];

  const data: HkoResponse = JSON.parse(text);
  if (data.lat == null || data.lon == null || !data.ptime) return [];

  return [
    {
      source: "hko",
      sourceEventId: `hko-${data.ptime}`,
      eventTime: toMysqlDatetimeUtc(new Date(data.ptime)),
      magnitude: data.mag ?? null,
      magnitudeType: null,
      depthKm: null,
      lat: data.lat,
      lng: data.lon,
      place: null,
      placeZh: data.region ?? null,
      tsunamiWarning: false,
      url: null,
    },
  ];
}
