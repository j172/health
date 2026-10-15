import { httpGetText } from "@/lib/server/net/httpClient";
import { resolveCountryIsoFromName } from "@/lib/server/who/countryIso";
import { resolveDiseaseName } from "@/lib/server/who/diseaseNames";
import { toMysqlDatetimeUtc } from "@/lib/server/who/types";
import type { IncomingWhoOutbreakNews } from "@/lib/server/who/types";

// WHO's own Disease Outbreak News OData API — the same endpoint who.int's
// own website calls (confirmed by reading www.who.int/api/news/$metadata,
// not guessed). One call returns the most recent DON items sorted newest
// first; there's no separate "since date" sync cursor needed since every
// row is upserted idempotently by article id and this fetches comfortably
// more than 180 days of history every tick (DON items publish at most a
// few times a week, so $top=100 reaches back well over a year). Confirmed
// reachable directly from this sandbox on 2026-10-15 (HTTP 200, real live
// data — used to build this file's fixture). See runSync.ts's top-of-file
// comment for why that does NOT establish the *production* host can reach
// it.
const DON_LIST_URL =
  "https://www.who.int/api/news/diseaseoutbreaknews" +
  "?sf_provider=dynamicProvider372&sf_culture=en" +
  "&$orderby=PublicationDateAndTime%20desc&$top=100" +
  "&$select=Id,DonId,Title,PublicationDateAndTime,ItemDefaultUrl,LastModified";

interface RawWhoDonItem {
  DonId?: string;
  Title?: string;
  PublicationDateAndTime?: string;
}

interface WhoDonListResponse {
  value?: RawWhoDonItem[];
}

const parseDateToMysqlUtc = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return toMysqlDatetimeUtc(d);
};

export interface WhoDonTitleParts {
  /** Disease segment, original language (English), as it appears in the title. */
  diseaseRaw: string;
  /** Location/country segment, original language — null when the title has
   * no dash- or comma-separated trailing segment at all (rare; falls back
   * to treating the whole title as the disease name). */
  locationRaw: string | null;
}

// Matches a hyphen/en-dash/em-dash immediately followed by whitespace. This
// is deliberately NOT "any dash" — WHO's titles routinely contain compound
// words with an un-spaced internal hyphen that must never be mistaken for
// the disease/country separator: "Multi-locations", "Multi-country",
// "COVID-19". None of those have a space right after the hyphen; WHO's own
// separator always does, even in the one observed case that has no space
// *before* it ("Marburg virus disease- Ethiopia"). Requiring only the
// trailing space (not a leading one) is what correctly tells apart
// "...toxin - Multi-country" (separator dash has a trailing space; the
// later dash inside "Multi-country" doesn't) from a false match on the
// compound word itself. Global, so the LAST match (found via matchAll) is
// always the real separator even when the location segment that follows it
// also contains its own internal hyphen.
const DASH_SEPARATOR = /[-–—]\s+/g;
// Fallback for WHO's comma-separated title style (used for multi-country and
// "Multi-locations" titles, which don't use a space-trailing dash at all).
const LAST_COMMA_SPLIT = /^(.*),\s*([^,]+)$/;

/**
 * Splits a WHO DON title into its disease and location segments. WHO's own
 * naming convention is "{Disease} – {Country}" (or "," for
 * multi-country/"Multi-locations" titles), but there is no structured
 * disease/country field anywhere in the API response itself (confirmed by
 * reading the full $metadata for the DiseaseOutbreakNews entity type — the
 * closest structured field, `regionscountries`, is a taxonomy GUID
 * collection with no ISO code and would need a second, separate taxonomy
 * lookup to resolve, which this ticket's scope doesn't call for) — so this
 * is parsed out of the one text field that exists. A title with neither
 * separator is kept whole as the disease name with no location, rather than
 * guessing a split point.
 */
export function parseWhoDonTitle(title: string): WhoDonTitleParts {
  const dashMatches = [...title.matchAll(DASH_SEPARATOR)];
  if (dashMatches.length > 0) {
    const last = dashMatches[dashMatches.length - 1];
    const diseaseRaw = title.slice(0, last.index).trim();
    const locationRaw = title.slice(last.index + last[0].length).trim();
    if (diseaseRaw && locationRaw) {
      return { diseaseRaw, locationRaw };
    }
  }
  const commaMatch = title.match(LAST_COMMA_SPLIT);
  if (commaMatch) {
    return { diseaseRaw: commaMatch[1].trim(), locationRaw: commaMatch[2].trim() };
  }
  return { diseaseRaw: title.trim(), locationRaw: null };
}

/**
 * Parses one raw WHO DON API item into an IncomingWhoOutbreakNews row, or
 * null if it's missing something a row can't exist without: the article id
 * (DonId — this is what the UNIQUE KEY matches on and what the public URL
 * is built from), the title (the "標題原文" column, and the only source for
 * the derived disease/country fields), or a parseable publish date (the
 * table's publish_date column is NOT NULL and is what the 180-day
 * retention sweep keys off). Everything else — disease-dictionary mapping,
 * country ISO resolution — degrades to null rather than dropping the row,
 * same "upstream source this codebase doesn't control" philosophy as
 * lib/server/gdacs/sources/gdacs.ts's parseGdacsEventFeature.
 */
export function parseWhoDonItem(item: RawWhoDonItem): IncomingWhoOutbreakNews | null {
  const articleId = item.DonId?.trim();
  if (!articleId) return null;

  const title = item.Title?.trim();
  if (!title) return null;

  const publishDate = parseDateToMysqlUtc(item.PublicationDateAndTime);
  if (!publishDate) return null;

  const { diseaseRaw, locationRaw } = parseWhoDonTitle(title);
  const diseaseMapped = resolveDiseaseName(diseaseRaw);
  const countryIso = locationRaw ? resolveCountryIsoFromName(locationRaw) : null;

  return {
    articleId,
    title,
    publishDate,
    diseaseRaw,
    diseaseMapped,
    countryIso,
    // Confirmed live (curl -L): this exact path redirects nowhere and
    // returns the real DON article for a given DonId.
    url: `https://www.who.int/emergencies/disease-outbreak-news/item/${encodeURIComponent(articleId)}`,
  };
}

/** Parses a full WHO DON list payload into rows, dropping any item parseWhoDonItem rejects. */
export function parseWhoDonResponse(payload: unknown): IncomingWhoOutbreakNews[] {
  const items = (payload as WhoDonListResponse | undefined)?.value;
  if (!Array.isArray(items)) return [];
  const rows: IncomingWhoOutbreakNews[] = [];
  for (const item of items) {
    const row = parseWhoDonItem(item);
    if (row) rows.push(row);
  }
  return rows;
}

/** Fetches the current WHO DON list and parses it into rows. */
export async function fetchWhoDonArticles(): Promise<IncomingWhoOutbreakNews[]> {
  const { status, text } = await httpGetText(DON_LIST_URL);
  if (status < 200 || status >= 300) throw new Error(`WHO DON request failed: HTTP ${status}`);
  return parseWhoDonResponse(JSON.parse(text));
}
