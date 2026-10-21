import AdmZip from "adm-zip";
import { httpGetText, httpRequest } from "@/lib/server/net/httpClient";
import { isCameoConflictRootCode } from "@/lib/server/gdelt/cameoConflictCodes";
import { toMysqlDateUtc, type IncomingConflictEvent } from "@/lib/server/gdelt/types";

/**
 * GDELT 2.0 Event Database sync — issue #774, part of #773 (全球動態地球：
 * 武裝衝突). GDELT needs no API key/token at all (#773's spec: "GDELT 不需要
 * 任何金鑰"), but it also has no query-by-CAMEO-code REST endpoint — the
 * actual mechanism is the plain static-file "last update" index GDELT
 * publishes every 15 minutes:
 *
 *   1. GET http://data.gdeltproject.org/gdeltv2/lastupdate.txt — three
 *      lines (export/mentions/gkg), each "<size> <md5> <url>". This
 *      pipeline only ever needs the ".export.CSV.zip" line.
 *   2. GET that zip (binary), unzip it (adm-zip — same library this repo
 *      already uses for TFDA's zipped JSON exports, see
 *      lib/server/drugs/sources/tfdaDrugAppearance.ts), and read the single
 *      .CSV entry inside as tab-separated text.
 *   3. Each line is one event, in GDELT 2.0's fixed 61-column positional
 *      schema (no header row — the column layout is part of GDELT's own
 *      published spec, not discoverable from the file itself). This module
 *      only reads the columns this item actually needs:
 *
 *        index  name                   note
 *        0      GLOBALEVENTID          permanent event id
 *        1      SQLDATE                YYYYMMDD
 *        6      Actor1Name
 *        16     Actor2Name
 *        28     EventRootCode          the CAMEO root code this item filters on
 *        52     ActionGeo_FullName
 *        53     ActionGeo_CountryCode  FIPS 10-4, not true ISO (see types.ts)
 *        56     ActionGeo_Lat
 *        57     ActionGeo_Long
 *        60     SOURCEURL              the original news article
 *
 * Confirmed against a live fetch of lastupdate.txt on 2026-10-22 (sandbox
 * build time) — the three lines really do look exactly like this, and the
 * zip really does contain one plain-text .CSV. #773's own spec text calls
 * this "the GDELT 2.0 API (api.gdeltproject.org)"; the actual working
 * mechanism is this data.gdeltproject.org static-file index instead —
 * api.gdeltproject.org's own endpoints (the DOC 2.0/GEO 2.0 APIs) are
 * article-search APIs with no EventRootCode/ActionGeo_Lat field at all, so
 * they can't implement this item's "CAMEO 19/20 根類別" filter as specified.
 * Same "verify before trusting the spec's exact host name" situation
 * lib/server/gdacs/sources/gdacs.ts's own doc comment already documents for
 * egress — here it was the endpoint shape, not reachability, that needed
 * checking directly.
 */
const LAST_UPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt";

const COLUMN = {
  GLOBALEVENTID: 0,
  SQLDATE: 1,
  Actor1Name: 6,
  Actor2Name: 16,
  EventRootCode: 28,
  ActionGeo_FullName: 52,
  ActionGeo_CountryCode: 53,
  ActionGeo_Lat: 56,
  ActionGeo_Long: 57,
  SOURCEURL: 60,
} as const;

/** The minimum column count a row needs for every field above to exist — a
 * defensive guard against a truncated/malformed line, not a hard-coded "61"
 * that would break if GDELT ever appends new trailing columns (it has
 * before, between 1.0 and 2.0). */
const MIN_COLUMN_COUNT = COLUMN.SOURCEURL + 1;

const MAX_DESCRIPTION_LENGTH = 300; // matches conflict_events.description VARCHAR(300)

/**
 * Parses lastupdate.txt's 3-line index and returns the ".export.CSV.zip"
 * URL, or null if the file doesn't look like the documented 3-line
 * "<size> <md5> <url>" format (a defensive guard, not an expected case —
 * fetchGdeltConflictEvents treats null as a hard failure for this sync tick,
 * same as GDACS's "HTTP status not 2xx" failure path).
 */
export const parseGdeltLastUpdateText = (text: string): { exportZipUrl: string | null } => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/\s+/);
    const url = parts[parts.length - 1];
    if (url && url.endsWith(".export.CSV.zip")) {
      return { exportZipUrl: url };
    }
  }
  return { exportZipUrl: null };
};

/**
 * Unzips a GDELT export archive (already fetched as a Buffer) and returns
 * the single .CSV entry's text content. Throws if the zip contains no such
 * entry — a malformed/empty zip is a hard failure for this sync tick, same
 * as an HTTP error would be.
 */
export const extractGdeltExportCsvText = (zipBuffer: Buffer): string => {
  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntries().find((e) => /\.csv$/i.test(e.entryName));
  if (!entry) throw new Error("GDELT export ZIP contained no .CSV entry");
  return entry.getData().toString("utf-8");
};

/**
 * Builds a short, already-truncated description from the event's actors
 * (falling back to the action location when neither actor has a name) —
 * GDELT's event rows carry no headline/summary field of their own (see this
 * module's own doc comment on why only SOURCEURL, not article text, is
 * available here).
 */
const buildDescription = (actor1Name: string, actor2Name: string, locationName: string): string => {
  const actors = [actor1Name, actor2Name].filter(Boolean);
  const raw = actors.length > 0 ? actors.join(" ↔ ") : locationName || "GDELT reported event";
  return raw.length > MAX_DESCRIPTION_LENGTH ? `${raw.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…` : raw;
};

/**
 * Parses one already tab-split GDELT event row into an IncomingConflictEvent,
 * or null when the row should be dropped — either it's structurally
 * unusable (too few columns, no event id, no usable position) or it simply
 * isn't a CAMEO 19/20 event (the AC: "只篩選 CAMEO 19/20 根類別事件" filter —
 * this is the one and only place that filter is applied, via
 * isCameoConflictRootCode, never a free-text match). A row failing this
 * filter is the expected, overwhelmingly common case (GDELT's export is
 * "every world news event"), not an error.
 */
export const parseGdeltEventRow = (fields: string[]): IncomingConflictEvent | null => {
  if (fields.length < MIN_COLUMN_COUNT) return null;

  const rootCode = fields[COLUMN.EventRootCode];
  if (!isCameoConflictRootCode(rootCode)) return null;

  const sourceEventId = fields[COLUMN.GLOBALEVENTID];
  if (!sourceEventId) return null;

  const eventDate = toMysqlDateUtc(fields[COLUMN.SQLDATE]);
  if (!eventDate) return null;

  // `Number("")` is 0, not NaN — a real coordinate in the Gulf of Guinea, so
  // an empty-string field (GDELT's own "couldn't geocode this" signal) must
  // be rejected explicitly rather than silently becoming (0, 0).
  const latText = fields[COLUMN.ActionGeo_Lat];
  const lngText = fields[COLUMN.ActionGeo_Long];
  if (!latText || !lngText) return null;
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const countryName = fields[COLUMN.ActionGeo_FullName] || null;
  const countryIso = fields[COLUMN.ActionGeo_CountryCode] || null;
  const sourceUrl = fields[COLUMN.SOURCEURL] || null;

  return {
    source: "gdelt",
    sourceEventId,
    eventDate,
    countryIso,
    countryName,
    lat,
    lng,
    fatalitiesEstimate: null,
    rootCode,
    description: buildDescription(fields[COLUMN.Actor1Name], fields[COLUMN.Actor2Name], countryName ?? ""),
    sourceUrl,
  };
};

/** Parses a full GDELT export CSV's text into rows, dropping any line
 * parseGdeltEventRow rejects (either malformed, or simply not CAMEO 19/20 —
 * see that function's own doc comment). */
export const parseGdeltEventExportText = (csvText: string): IncomingConflictEvent[] => {
  const lines = csvText.split(/\r?\n/).filter((line) => line.length > 0);
  const rows: IncomingConflictEvent[] = [];
  for (const line of lines) {
    const row = parseGdeltEventRow(line.split("\t"));
    if (row) rows.push(row);
  }
  return rows;
};

/**
 * Fetches GDELT's latest 15-minute event export and returns every CAMEO
 * 19/20 (armed-conflict) row it contains. Throws on any fetch/parse
 * failure — the caller (lib/server/conflicts/runSync.ts) is responsible for
 * catching that and degrading gracefully (AC: "GDELT...API 逾時或無法連線時
 * 排程只記警告、不讓 health-web 崩當"), same division of responsibility as
 * lib/server/gdacs/runSync.ts/fetchGdacsEvents.
 */
export async function fetchGdeltConflictEvents(): Promise<IncomingConflictEvent[]> {
  const { status, text } = await httpGetText(LAST_UPDATE_URL);
  if (status < 200 || status >= 300) throw new Error(`GDELT lastupdate.txt request failed: HTTP ${status}`);

  const { exportZipUrl } = parseGdeltLastUpdateText(text);
  if (!exportZipUrl) throw new Error("GDELT lastupdate.txt did not contain an .export.CSV.zip URL");

  const zipResponse = await httpRequest(exportZipUrl);
  if (zipResponse.status < 200 || zipResponse.status >= 300) {
    throw new Error(`GDELT export ZIP request failed: HTTP ${zipResponse.status}`);
  }

  const csvText = extractGdeltExportCsvText(zipResponse.buffer);
  return parseGdeltEventExportText(csvText);
}
