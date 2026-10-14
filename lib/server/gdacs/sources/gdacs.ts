import { httpGetText } from "@/lib/server/net/httpClient";
import { deriveTcBasin } from "@/lib/server/gdacs/basin";
import { toMysqlDatetimeUtc } from "@/lib/server/gdacs/types";
import type { GdacsAlertLevel, GdacsEventType, IncomingGdacsEvent } from "@/lib/server/gdacs/types";

// GDACS (Global Disaster Alert and Coordination System) event list — a
// single call returns every currently-tracked disaster worldwide (all
// types, all alert levels), so one fetch per sync tick is enough; there is
// no pagination or date-range parameter needed. Confirmed reachable
// directly from this sandbox on 2026-10-14 (HTTP 200, live data) — see the
// PR description for why that does NOT establish the *production* host can
// reach it (see runSync.ts's top-of-file comment).
const EVENT_LIST_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";

const geometryUrl = (eventType: string, eventId: string, episodeId: string): string =>
  `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=${encodeURIComponent(eventType)}&eventid=${encodeURIComponent(eventId)}&episodeid=${encodeURIComponent(episodeId)}`;

const KNOWN_EVENT_TYPES: readonly GdacsEventType[] = ["EQ", "TC", "FL", "VO", "DR", "WF"];
const KNOWN_ALERT_LEVELS: readonly GdacsAlertLevel[] = ["Green", "Orange", "Red"];

interface GdacsFeature {
  type?: string;
  bbox?: [number, number, number, number];
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    eventtype?: string;
    eventid?: string | number;
    episodeid?: string | number;
    name?: string;
    description?: string;
    alertlevel?: string;
    alertscore?: number | string;
    iso3?: string;
    fromdate?: string;
    todate?: string;
    url?: { report?: string };
    Class?: string;
  };
}

interface GdacsFeatureCollection {
  type?: string;
  features?: GdacsFeature[];
}

const parseDateToMysqlUtc = (raw: string | undefined): string | null => {
  if (!raw) return null;
  // GDACS's fromdate/todate are naive timestamps with no timezone suffix
  // (e.g. "2026-10-13T15:00:00") that represent UTC — appending "Z" makes
  // `Date` parse them as UTC instead of the server process's local zone.
  const d = new Date(raw.endsWith("Z") ? raw : `${raw}Z`);
  if (isNaN(d.getTime())) return null;
  return toMysqlDatetimeUtc(d);
};

/** Centroid lat/lng from a feature's Point geometry, falling back to its bbox center if the geometry is missing or isn't a Point. */
const resolveLatLng = (feature: GdacsFeature): { lat: number; lng: number } | null => {
  const coords = feature.geometry?.coordinates;
  if (feature.geometry?.type === "Point" && Array.isArray(coords) && typeof coords[0] === "number" && typeof coords[1] === "number") {
    return { lng: coords[0], lat: coords[1] };
  }
  if (Array.isArray(feature.bbox) && feature.bbox.length === 4) {
    const [minLng, minLat, maxLng, maxLat] = feature.bbox;
    return { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 };
  }
  return null;
};

/**
 * Parses one GDACS GeoJSON feature into an IncomingGdacsEvent, or null if
 * it's missing something a row can't exist without (event type/id, or any
 * usable position). Everything else degrades to a documented default or
 * null rather than rejecting the whole feature — GDACS's feed is a live
 * upstream source this codebase doesn't control, so a single missing
 * optional field (e.g. no iso3 for a multi-country drought) must not drop
 * the entire event. TC's `basin`/`trackGeoJson` are left null here — the
 * caller (fetchGdacsEvents) fills those in with a separate request, since
 * they need the episode-specific geometry endpoint, not this list endpoint.
 */
export const parseGdacsEventFeature = (feature: GdacsFeature): IncomingGdacsEvent | null => {
  const props = feature.properties;
  if (!props) return null;

  const eventType = props.eventtype;
  if (!eventType || !KNOWN_EVENT_TYPES.includes(eventType as GdacsEventType)) return null;

  const eventId = props.eventid != null ? String(props.eventid) : "";
  if (!eventId) return null;

  const position = resolveLatLng(feature);
  if (!position) return null;

  const alertLevel = KNOWN_ALERT_LEVELS.includes(props.alertlevel as GdacsAlertLevel)
    ? (props.alertlevel as GdacsAlertLevel)
    : "Green"; // GDACS's own lowest/safe tier — used when the upstream omits or sends an unrecognized value.

  const alertScoreNum = props.alertscore != null ? Number(props.alertscore) : NaN;

  return {
    eventType: eventType as GdacsEventType,
    eventId,
    episodeId: props.episodeid != null ? String(props.episodeid) : "0",
    alertLevel,
    alertScore: isNaN(alertScoreNum) ? null : alertScoreNum,
    countryIso: props.iso3 ? props.iso3.toUpperCase() : null,
    lat: position.lat,
    lng: position.lng,
    startTime: parseDateToMysqlUtc(props.fromdate),
    endTime: parseDateToMysqlUtc(props.todate),
    title: props.name || props.description || `${eventType}-${eventId}`,
    reportUrl: props.url?.report ?? null,
    basin: null,
    trackGeoJson: null,
  };
};

/** Parses a full GDACS event-list payload into rows, dropping any feature parseGdacsEventFeature rejects. */
export const parseGdacsEventList = (payload: unknown): IncomingGdacsEvent[] => {
  const features = (payload as GdacsFeatureCollection | undefined)?.features;
  if (!Array.isArray(features)) return [];
  const rows: IncomingGdacsEvent[] = [];
  for (const feature of features) {
    const row = parseGdacsEventFeature(feature);
    if (row) rows.push(row);
  }
  return rows;
};

/**
 * Trims a raw getgeometry FeatureCollection down to just the storm's actual
 * path: the current-position centroid plus the LineString track segments.
 * The live response also carries ~50 wind-radii circle polygons (one per
 * forecast point) and three uncertainty-cone polygons (Green/Orange/Red)
 * that balloon a single TC's response to ~300KB — none of that is "the
 * track", and storing it would make gdacs_events' JSON column far heavier
 * than this table needs to be (this is a live snapshot replaced every sync,
 * not an accumulating history, but still: 15-20 concurrent TCs x 300KB on a
 * 768MB-heap host is not a trade worth making for data nothing reads).
 */
export const extractTcTrack = (payload: unknown): Record<string, unknown> | null => {
  const features = (payload as GdacsFeatureCollection | undefined)?.features;
  if (!Array.isArray(features) || features.length === 0) return null;

  const kept = features.filter(
    (f) => f.geometry?.type === "LineString" || f.properties?.Class === "Point_Centroid",
  );
  if (kept.length === 0) return null;

  return { type: "FeatureCollection", features: kept };
};

/** Fetches and trims one TC event's track geometry for its current episode. Returns null on any failure — a missing track must never fail the whole sync (see runSync.ts). */
const fetchTcTrack = async (eventId: string, episodeId: string): Promise<Record<string, unknown> | null> => {
  try {
    // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
    // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
    const { status, text } = await httpGetText(geometryUrl("TC", eventId, episodeId));
    if (status < 200 || status >= 300) return null;
    return extractTcTrack(JSON.parse(text));
  } catch {
    return null;
  }
};

/**
 * Fetches the full current GDACS event list and fills in TC-only fields
 * (basin, trackGeoJson). The event-list call is one request; each TC event
 * additionally needs its own getgeometry request (GDACS doesn't embed the
 * track in the list response), run concurrently via Promise.allSettled so
 * one TC's geometry fetch failing doesn't lose any other event — including
 * other TCs.
 */
export async function fetchGdacsEvents(): Promise<IncomingGdacsEvent[]> {
  const { status, text } = await httpGetText(EVENT_LIST_URL);
  if (status < 200 || status >= 300) throw new Error(`GDACS event list request failed: HTTP ${status}`);

  const rows = parseGdacsEventList(JSON.parse(text));

  const tcRows = rows.filter((r) => r.eventType === "TC");
  const tracks = await Promise.allSettled(tcRows.map((r) => fetchTcTrack(r.eventId, r.episodeId)));

  tcRows.forEach((row, i) => {
    row.basin = deriveTcBasin(row.lat, row.lng);
    const result = tracks[i];
    row.trackGeoJson = result.status === "fulfilled" ? result.value : null;
  });

  return rows;
}
