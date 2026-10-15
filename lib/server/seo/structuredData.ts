import type { CulturalActivityItem, CulturalShowInfo } from "@/lib/server/culture/types";
import { getBaseUrl } from "@/lib/server/news/seo";
import { resolvePageLocale, type PageLocaleOptions } from "./pageLocale";

/**
 * Pure JSON-LD builders for issue #438 §R's remaining page types:
 *
 * - 藝文活動 → `Event`                         (buildCulturalEventsJsonLd)
 * - 機構清單 → `ItemList` of `Hospital`／`MedicalClinic`／`Pharmacy`／`Place`
 *   with `geo`／`address`／`telephone`        (buildFacilityListJsonLd)
 * - 我附近 → `ItemList`                         (buildNearbyGraphJsonLd)
 * - 外語版 → `inLanguage` + `translationOfWork` (buildLocalizedWebPageJsonLd,
 *   plus the `locale` option on the existing tool/guide/home builders in
 *   lib/server/news/seo.ts)
 *
 * No I/O, no DB, no `Date.now()` (callers inject `now`) — the data loading
 * lives in lib/server/seo/toolPageStructuredData.ts so these stay trivially
 * testable. Nothing here ever receives or emits a per-visitor location: the
 * facility/event samples are location-independent, and "/nearby" only
 * describes its facility *types*.
 */

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const LINE_SEPARATORS = new RegExp("[\\u2028\\u2029]", "g");

/**
 * `JSON.stringify` for embedding inside `<script type="application/ld+json">`
 * via dangerouslySetInnerHTML. Plain JSON.stringify leaves `<` untouched, so a
 * data-driven string such as an event title containing `</script><script>…`
 * would close the tag and inject markup. Escaping `<` (and the two line
 * separators that are legal JSON but historically broke JS string literals)
 * keeps the output valid JSON that parses back to the identical value.
 */
export const serializeJsonLd = (value: unknown): string =>
  (JSON.stringify(value) ?? "null")
    .replace(/</g, "\\u003c")
    .replace(LINE_SEPARATORS, (char) => `\\u${char.charCodeAt(0).toString(16)}`);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const isHttpUrl = (value: string | null | undefined): boolean =>
  typeof value === "string" && /^https?:\/\/\S+$/i.test(value.trim());

const cleanText = (value: string | null | undefined): string =>
  (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const truncate = (text: string, maxLength: number): string =>
  text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trim()}…`;

/**
 * A usable WGS84 coordinate pair, or null. Facility rows whose geocoding is
 * still pending (null/NaN) or failed to a bogus 0,0 are skipped by callers
 * instead of emitting an empty or wrong `geo` node.
 */
export const toValidCoordinate = (
  lat: number | string | null | undefined,
  lng: number | string | null | undefined,
): { latitude: number; longitude: number } | null => {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  if (typeof lat === "string" && lat.trim() === "") return null;
  if (typeof lng === "string" && lng.trim() === "") return null;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
};

const geoCoordinates = (coordinate: { latitude: number; longitude: number }): Record<string, unknown> => ({
  "@type": "GeoCoordinates",
  latitude: coordinate.latitude,
  longitude: coordinate.longitude,
});

// ---------------------------------------------------------------------------
// 藝文活動 → Event
// ---------------------------------------------------------------------------

const ENGLISH_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

interface ParsedEventDate {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM:SS, or null for a date-only value. */
  time: string | null;
}

const pad = (value: number): string => String(value).padStart(2, "0");

const isRealCalendarDate = (year: number, month: number, day: number): boolean => {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
};

/**
 * Parses the date shapes cultural_events actually stores — `2026/10/31`,
 * `2026/10/31 14:30:00`, `2026-10-31`, and the Java-style `Aug 9, 2026 12:00:00 AM`
 * some feeds leak through (their time part is always a midnight placeholder,
 * so it is dropped). Anything else (「常態開放」, 「2026年時間未定」, ranges…) is
 * not a date and returns null. A literal 00:00:00 is likewise treated as
 * date-only rather than asserting a midnight start.
 */
export const parseCulturalEventDate = (raw: string | null | undefined): ParsedEventDate | null => {
  const text = (raw ?? "").trim();
  if (!text) return null;

  const numeric = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (numeric) {
    const year = Number(numeric[1]);
    const month = Number(numeric[2]);
    const day = Number(numeric[3]);
    if (!isRealCalendarDate(year, month, day)) return null;
    const date = `${year}-${pad(month)}-${pad(day)}`;
    if (numeric[4] === undefined) return { date, time: null };
    const hour = Number(numeric[4]);
    const minute = Number(numeric[5]);
    const second = Number(numeric[6] ?? "0");
    if (hour > 23 || minute > 59 || second > 59) return { date, time: null };
    if (hour === 0 && minute === 0 && second === 0) return { date, time: null };
    return { date, time: `${pad(hour)}:${pad(minute)}:${pad(second)}` };
  }

  const english = /^([A-Za-z]{3})[A-Za-z]*\.? (\d{1,2}), (\d{4})(?: \d{1,2}:\d{2}:\d{2} [AP]M)?$/.exec(text);
  if (english) {
    const month = ENGLISH_MONTHS[english[1].toLowerCase()];
    const day = Number(english[2]);
    const year = Number(english[3]);
    if (!month || !isRealCalendarDate(year, month, day)) return null;
    return { date: `${year}-${pad(month)}-${pad(day)}`, time: null };
  }

  return null;
};

/** ISO 8601 for schema.org: date-only stays date-only; a time carries Taiwan's fixed +08:00 offset. */
const toIsoDateTime = (parsed: ParsedEventDate): string =>
  parsed.time ? `${parsed.date}T${parsed.time}+08:00` : parsed.date;

const compareParsed = (a: ParsedEventDate, b: ParsedEventDate): number =>
  toIsoDateTime({ ...a, time: a.time ?? "00:00:00" }).localeCompare(toIsoDateTime({ ...b, time: b.time ?? "00:00:00" }));

/** Today's calendar date in Taiwan (UTC+8, no DST), as YYYY-MM-DD. */
export const taipeiToday = (now: Date): string => new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

const hasLocation = (show: CulturalShowInfo): boolean => Boolean((show.location ?? "").trim() || (show.locationName ?? "").trim());

export const DEFAULT_EVENT_LIMIT = 10;
const EVENT_DESCRIPTION_MAX = 200;

const buildEventNode = (
  item: CulturalActivityItem,
  pageUrl: string,
  today: string,
  baseUrl: string,
): Record<string, unknown> | null => {
  const title = cleanText(item.title);
  if (!title) return null;

  const candidates = (item.shows ?? []).filter(hasLocation);
  if (candidates.length === 0) return null; // schema.org/Event needs a location; never invent one.

  // Prefer the next show that has not happened yet; fall back to the first one.
  const show =
    candidates.find((candidate) => {
      const parsed = parseCulturalEventDate(candidate.time);
      return parsed !== null && parsed.date >= today;
    }) ?? candidates[0];

  const showStart = parseCulturalEventDate(show.time);
  const start = showStart ?? parseCulturalEventDate(item.startDate);
  if (!start) return null; // 「常態開放」 venues etc. are not events.

  let end: ParsedEventDate | null;
  if (showStart) {
    const showEnd = parseCulturalEventDate(show.endTime);
    end = showEnd && compareParsed(showEnd, showStart) >= 0 ? showEnd : null;
  } else {
    const eventEnd = parseCulturalEventDate(item.endDate);
    end = eventEnd && compareParsed(eventEnd, start) >= 0 ? eventEnd : null;
  }

  // Skip events that are already over (the DB query filters on end_date, the
  // static-seed fallback does not).
  const lastDay = [parseCulturalEventDate(item.endDate)?.date, end?.date, start.date]
    .filter((day): day is string => typeof day === "string")
    .sort()
    .at(-1) as string;
  if (lastDay < today) return null;

  const placeName = cleanText(show.locationName) || cleanText(show.location);
  const streetAddress = cleanText(show.location);
  const coordinate = toValidCoordinate(show.latitude, show.longitude);
  const place: Record<string, unknown> = {
    "@type": "Place",
    name: placeName,
    address: {
      "@type": "PostalAddress",
      ...(streetAddress ? { streetAddress } : {}),
      ...(cleanText(show.city) ? { addressRegion: cleanText(show.city) } : {}),
      addressCountry: "TW",
    },
    ...(coordinate ? { geo: geoCoordinates(coordinate) } : {}),
  };

  const description = truncate(cleanText(item.description), EVENT_DESCRIPTION_MAX);
  const url = [item.sourceWebPromote, item.webSales].find(isHttpUrl)?.trim();
  const organizer = cleanText(item.masterUnit);
  const rawImage = (item.imageUrl ?? "").trim();
  const image = isHttpUrl(rawImage) ? rawImage : rawImage.startsWith("/") ? `${baseUrl}${rawImage}` : undefined;

  return {
    "@type": "Event",
    "@id": `${pageUrl}#event-${encodeURIComponent(item.id)}`,
    name: title,
    startDate: toIsoDateTime(start),
    ...(end ? { endDate: toIsoDateTime(end) } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: place,
    ...(description ? { description } : {}),
    ...(image ? { image: [image] } : {}),
    ...(url ? { url } : {}),
    ...(organizer ? { organizer: { "@type": "Organization", name: organizer } } : {}),
  };
};

/**
 * `@graph` of schema.org `Event` nodes for the 藝文活動 tool page, or null when
 * nothing qualifies. Only upcoming/ongoing events with a real start date and a
 * real venue are emitted (capped at `max`, default 10 — "small"), each from
 * its next upcoming show. `now` is injected so the output is deterministic.
 */
export const buildCulturalEventsJsonLd = (
  items: CulturalActivityItem[],
  options: PageLocaleOptions & { now?: Date; max?: number } = {},
): Record<string, unknown> | null => {
  const baseUrl = getBaseUrl();
  const pageLocale = resolvePageLocale(baseUrl, "/tools/cultural-events", options);
  const today = taipeiToday(options.now ?? new Date());
  const max = options.max ?? DEFAULT_EVENT_LIMIT;

  const events: Record<string, unknown>[] = [];
  for (const item of items) {
    if (events.length >= max) break;
    const node = buildEventNode(item, pageLocale.url, today, baseUrl);
    if (node) events.push(node);
  }
  if (events.length === 0) return null;

  return { "@context": "https://schema.org", "@graph": events };
};

// ---------------------------------------------------------------------------
// 機構清單 → ItemList of Hospital / MedicalClinic / Pharmacy / Place
// ---------------------------------------------------------------------------

export type FacilitySchemaType = "Hospital" | "MedicalClinic" | "Pharmacy" | "Place";

/** The shape of a `facilities` table row this builder reads (a subset of FacilityListItem). */
export interface FacilityJsonLdSource {
  name: string;
  address?: string | null;
  phone?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  service_item?: string | null;
}

const HOSPITAL_TIERS = ["醫學中心", "區域醫院", "地區醫院"];

/**
 * schema.org type for a facility row: NHI hospital tiers → `Hospital`, other
 * NHI clinic rows → `MedicalClinic`, pharmacies → `Pharmacy`, everything else
 * (AED sites, toilets, cool spots…) → the generic `Place`.
 */
export const resolveFacilitySchemaType = (
  facilityType: string,
  serviceItem?: string | null,
  name?: string | null,
): FacilitySchemaType => {
  if (facilityType === "pharmacy") return "Pharmacy";
  if (facilityType === "clinic") {
    if (HOSPITAL_TIERS.some((tier) => (serviceItem ?? "").includes(tier))) return "Hospital";
    if ((name ?? "").trim().endsWith("醫院")) return "Hospital";
    return "MedicalClinic";
  }
  return "Place";
};

export const DEFAULT_FACILITY_LIMIT = 10;

/**
 * `ItemList` of up to `max` (default 10) facilities for a facility-list tool
 * page, or null when no row has usable coordinates. Rows lacking valid
 * coordinates are skipped rather than emitted with an empty `geo`. The input
 * must be a location-independent sample — never a per-visitor "nearest" result.
 */
export const buildFacilityListJsonLd = (
  input: {
    facilityType: string;
    /** Page/tool name, used as the list's name (already localized by the caller). */
    name: string;
    description?: string;
    facilities: FacilityJsonLdSource[];
  },
  options: PageLocaleOptions & { canonicalPath: string; max?: number },
): Record<string, unknown> | null => {
  const baseUrl = getBaseUrl();
  const pageLocale = resolvePageLocale(baseUrl, options.canonicalPath, options);
  const max = options.max ?? DEFAULT_FACILITY_LIMIT;

  const items: Record<string, unknown>[] = [];
  for (const facility of input.facilities) {
    if (items.length >= max) break;
    const name = cleanText(facility.name);
    const coordinate = toValidCoordinate(facility.lat, facility.lng);
    if (!name || !coordinate) continue;

    const address = cleanText(facility.address);
    const telephone = cleanText(facility.phone);
    items.push({
      "@type": "ListItem",
      position: items.length + 1,
      item: {
        "@type": resolveFacilitySchemaType(input.facilityType, facility.service_item, name),
        name,
        ...(address
          ? { address: { "@type": "PostalAddress", streetAddress: address, addressCountry: "TW" } }
          : {}),
        ...(telephone ? { telephone } : {}),
        geo: geoCoordinates(coordinate),
      },
    });
  }
  if (items.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${pageLocale.url}#facilities`,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    itemListElement: items,
  };
};

// ---------------------------------------------------------------------------
// 我附近 → WebPage + ItemList (of facility types, never of the visitor's results)
// ---------------------------------------------------------------------------

export interface NearbyListEntry {
  name: string;
  /** Absolute URL of the tool page behind this facility type. */
  url?: string;
  description?: string;
}

const buildLocalizedPageNode = (
  input: { name: string; description: string; mainEntityId?: string },
  pageLocale: ReturnType<typeof resolvePageLocale>,
  baseUrl: string,
): Record<string, unknown> => ({
  "@type": "WebPage",
  "@id": `${pageLocale.url}#webpage`,
  url: pageLocale.url,
  name: input.name,
  description: input.description,
  isPartOf: { "@id": `${baseUrl}/#website` },
  inLanguage: pageLocale.inLanguage,
  ...pageLocale.translationLinks,
  ...(input.mainEntityId ? { mainEntity: { "@id": input.mainEntityId } } : {}),
});

/**
 * "/nearby" structured data: a WebPage whose main entity is an ItemList of the
 * facility types the page looks up (AED, 診所, 藥局…), each linking to its tool
 * page. The page's actual results depend on the visitor's live geolocation and
 * are rendered client-side only — they are deliberately not (and cannot be)
 * part of this server-rendered JSON-LD, so no coordinates of any kind appear.
 */
export const buildNearbyGraphJsonLd = (
  input: { name: string; description: string; entries: NearbyListEntry[] },
  options: PageLocaleOptions = {},
): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  const pageLocale = resolvePageLocale(baseUrl, "/nearby", options);
  const listId = `${pageLocale.url}#types`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      buildLocalizedPageNode({ name: input.name, description: input.description, mainEntityId: listId }, pageLocale, baseUrl),
      {
        "@type": "ItemList",
        "@id": listId,
        name: input.name,
        mainEntityOfPage: { "@id": `${pageLocale.url}#webpage` },
        itemListElement: input.entries.map((entry, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: entry.name,
          ...(entry.url ? { url: entry.url } : {}),
          ...(entry.description ? { description: entry.description } : {}),
        })),
      },
    ],
  };
};

// ---------------------------------------------------------------------------
// 外語版 → WebPage with inLanguage + translationOfWork
// ---------------------------------------------------------------------------

/**
 * Minimal localized WebPage node for /en /ja /ko pages whose only structured
 * data used to be a BreadcrumbList (which has no `inLanguage`): the
 * locale-prefixed URL as identity, the page's own localized name/description,
 * `inLanguage`, and `translationOfWork` back to the zh page.
 */
export const buildLocalizedWebPageJsonLd = (
  input: { name: string; description: string; canonicalPath: string },
  options: PageLocaleOptions = {},
): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  const pageLocale = resolvePageLocale(baseUrl, input.canonicalPath, options);
  return {
    "@context": "https://schema.org",
    ...buildLocalizedPageNode({ name: input.name, description: input.description }, pageLocale, baseUrl),
  };
};
