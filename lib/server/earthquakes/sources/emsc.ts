import { httpGetText } from "@/lib/server/net/httpClient";
import type { IncomingEarthquake } from "@/lib/server/earthquakes/types";
import { toMysqlDatetimeUtc } from "@/lib/server/earthquakes/types";

// EMSC (European-Mediterranean Seismological Centre) FDSN event query —
// global coverage, not just Europe. limit=100 ordered by time comfortably
// covers more than a 5-minute window even during active seismic periods.
const SOURCE_URL = "https://www.seismicportal.eu/fdsnws/event/1/query?limit=100&format=json&orderby=time";

interface EmscFeature {
  id: string;
  properties: {
    time: string;
    flynn_region: string | null;
    depth: number | null;
    mag: number | null;
    magtype: string | null;
  };
  geometry: { coordinates: [number, number, number] };
}

interface EmscResponse {
  features: EmscFeature[];
}

export async function fetchEmscEarthquakes(): Promise<IncomingEarthquake[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`EMSC earthquake feed request failed: HTTP ${status}`);

  let data: EmscResponse;
  try {
    data = JSON.parse(text);
  } catch (error) {
    console.error(`EMSC parse failed: typeof=${typeof text}, length=${(text as unknown as string)?.length}, head=${JSON.stringify(text).slice(0, 300)}`);
    throw error;
  }

  return data.features.map((f): IncomingEarthquake => ({
    source: "emsc",
    sourceEventId: f.id,
    eventTime: toMysqlDatetimeUtc(new Date(f.properties.time)),
    magnitude: f.properties.mag,
    magnitudeType: f.properties.magtype,
    depthKm: f.properties.depth,
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    place: f.properties.flynn_region,
    placeZh: null,
    tsunamiWarning: false,
    url: `https://www.seismicportal.eu/eventdetails.html?unid=${f.id}`,
  }));
}
