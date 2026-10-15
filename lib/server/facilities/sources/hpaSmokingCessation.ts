import AdmZip from "adm-zip";
import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpRequest } from "@/lib/server/net/httpClient";
import { normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";

// data.gov.tw 6954「各縣市合約戒菸醫療院所」(issue #569, parent #562) — the
// national baseline that replaces the 6 hand-written smoking_cessation seed
// rows in scripts/build-expansion-seeds.mjs. 2026-10-14 實測：2,838 筆.
//
// Distributed as an ODS (OpenDocument Spreadsheet) file, not CSV/JSON like
// every other facilities source here — an ODS is a ZIP archive containing a
// content.xml with the actual spreadsheet data. `adm-zip` and
// `fast-xml-parser` are already project dependencies (used by
// lib/server/drugs/sources/tfdaDrug*.ts and lib/server/rss/parseRss.ts
// respectively), but `fast-xml-parser` isn't used here: ODS cell text can be
// split across mixed-content nodes (`<text:p>...<text:s text:c="4"/></text:p>`
// — a run of N repeated spaces encoded as its own element, confirmed live in
// every phone-number cell this file has), which fast-xml-parser's default
// config doesn't reassemble into plain text without a lot of extra
// configuration. A small regex-based extractor (parseOdsSheetRows below) is
// both simpler and more transparent for this flat, single-sheet,
// header+rows table shape than reaching for a second XML-parsing strategy.
//
// **Not verified reachable from the production host yet** — confirmed
// working from a residential network (2026-10-14: HTTP 200, real ODS
// payload) but hpa.gov.tw's other endpoints have each needed their own
// httpClient.ts TLS workaround already (see TWCA_SECURE_SSL_INTERMEDIATE_CA
// there), and this GetFile.ashx endpoint 403s without a browser-like
// User-Agent (httpClient.ts's default UA already covers that — curl without
// one also got a 403 against the exact same URL). Coordinator: run this
// source's sync from the production host (e.g. the admin facilities-sync
// endpoint with `{"sources":["hpa_smoking_cessation_6954"]}`) before relying
// on its scheduled runs.
const SOURCE_URL =
  "https://www.hpa.gov.tw/Pages/ashx/GetFile.ashx?lang=c&type=1&sid=76891782db634c60b4dc055a7de50bc0";

const SHEET_NAME = "各縣市合約戒菸醫療院所";

const XML_ENTITY_MAP: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&apos;": "'",
  "&quot;": '"',
};

function decodeXmlEntities(s: string): string {
  return s.replace(/&(lt|gt|amp|apos|quot);/g, (m) => XML_ENTITY_MAP[m] ?? m);
}

/**
 * Extracts the plain text of one `<table:table-cell>...</table:table-cell>`
 * element's inner XML. ODS represents a run of N repeated spaces as
 * `<text:s text:c="N"/>` (or a single bare `<text:s/>`) instead of literal
 * whitespace — every 電話 cell in this dataset ends with one of these
 * (e.g. "02-23123456-2147" followed by `<text:s text:c="4"/>`, padding the
 * fixed-width column the original spreadsheet author typed into). Multiple
 * `<text:p>` paragraphs within one cell (not seen in this dataset, but legal
 * ODS) are joined with a newline, matching how a real spreadsheet cell with
 * a manual line break would read.
 */
export function odsCellText(innerXml: string): string {
  const paragraphs = [...innerXml.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)];
  if (paragraphs.length === 0) return "";
  return paragraphs
    .map((p) => {
      let text = p[1];
      text = text.replace(/<text:s\s+text:c="(\d+)"\s*\/>/g, (_, n: string) => " ".repeat(Number(n)));
      text = text.replace(/<text:s\s*\/>/g, " ");
      text = text.replace(/<[^>]+>/g, "");
      return decodeXmlEntities(text);
    })
    .join("\n")
    .trim();
}

/**
 * Parses one named sheet out of an ODS `content.xml` into a grid of plain-
 * text cells, one array per row, in column order. Throws if the sheet name
 * isn't found (fails loudly on a renamed sheet, same philosophy as
 * validateImportRows() below for renamed columns).
 *
 * Deliberately does NOT act on `table:number-columns-repeated` /
 * `table:number-rows-repeated` by expanding them into N copies — ODS uses
 * these attributes to compactly represent the large run of unused trailing
 * columns/rows every real spreadsheet has (this file's real export ends
 * with a single `<table:table-row table:number-rows-repeated="1045737">`
 * standing in for over a million blank rows). Expanding those would be both
 * wasteful and pointless: every such placeholder row's cells are empty, so
 * it's already excluded downstream by the normal "row has no 院所名稱"
 * filter without any special-case code here.
 */
export function parseOdsSheetRows(contentXml: string, sheetName: string): string[][] {
  const tableOpenRegex = /<table:table\b[^>]*>/g;
  let tableMatch: RegExpExecArray | null;
  let sheetStart = -1;
  while ((tableMatch = tableOpenRegex.exec(contentXml))) {
    if (tableMatch[0].includes(`table:name="${sheetName}"`)) {
      sheetStart = tableMatch.index + tableMatch[0].length;
      break;
    }
  }
  if (sheetStart === -1) {
    throw new Error(`HPA smoking-cessation ODS: sheet "${sheetName}" not found — the upstream file's sheet name may have changed.`);
  }
  const sheetEnd = contentXml.indexOf("</table:table>", sheetStart);
  if (sheetEnd === -1) throw new Error("HPA smoking-cessation ODS: unterminated <table:table> element");
  const sheetBody = contentXml.slice(sheetStart, sheetEnd);

  const rowRegex = /<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>|<table:table-row\b[^>]*\/>/g;
  const cellRegex = /<table:table-cell\b[^>]*\/>|<table:table-cell\b[^>]*>([\s\S]*?)<\/table:table-cell>/g;

  const rows: string[][] = [];
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(sheetBody))) {
    const rowInner = rowMatch[1] ?? "";
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    cellRegex.lastIndex = 0;
    while ((cellMatch = cellRegex.exec(rowInner))) {
      cells.push(cellMatch[1] !== undefined ? odsCellText(cellMatch[1]) : "");
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * Maps a parsed grid (first row = header) to objects keyed by header label,
 * using the header row's own cell *positions* rather than assuming a fixed
 * column count — the header row carries a few more (always-empty, part of
 * the same "represent the rest of the row compactly" trailing placeholder
 * described above) cells than there are real columns, and this skips those
 * instead of baking in "exactly 7 columns".
 *
 * Rows with no 院所名稱 (blank name) are dropped here — covers both a
 * genuinely blank data row and the single synthetic bulk-blank trailing row
 * parseOdsSheetRows() above deliberately doesn't filter out itself.
 */
export function odsRowsToRecords(grid: string[][]): Record<string, string>[] {
  if (grid.length === 0) return [];
  const [headerRow, ...dataRows] = grid;
  const headerPositions = headerRow
    .map((label, index) => ({ label, index }))
    .filter((h) => h.label !== "");

  return dataRows
    .map((row) => {
      const record: Record<string, string> = {};
      for (const { label, index } of headerPositions) {
        record[label] = row[index] ?? "";
      }
      return record;
    })
    .filter((r) => (r["院所名稱"] ?? "") !== "");
}

interface HpaSmokingCessationRawRow {
  醫事機構類別: string;
  院所名稱: string;
  電話: string;
  郵遞區號: string;
  地址: string;
  給藥: string;
  衛教: string;
}

// Critical-field schema for the header-mapped rows. 院所名稱/地址 are
// identity-bearing (sourceId below depends on them); 醫事機構類別/電話/
// 郵遞區號/給藥/衛教 are the remaining fields this ticket's acceptance
// criteria explicitly calls out ("欄位包括醫事機構類別、院所名稱、電話、
// 郵遞區號、地址、給藥、衛教"), so a silent upstream column rename on any of
// them should fail loudly too, not just on the two identity fields.
// `.nullable()` (not `.optional()`) so a column entirely missing from every
// row (renamed/removed upstream) fails validation, while one row's
// legitimately blank value (confirmed live: 4/2838 rows have no 給藥 flag,
// 2098/2838 have no 衛教 flag) still passes.
export const hpaSmokingCessationRawSchema = z.object({
  醫事機構類別: z.string().nullable(),
  院所名稱: z.string().nullable(),
  電話: z.string().nullable(),
  郵遞區號: z.string().nullable(),
  地址: z.string().nullable(),
  給藥: z.string().nullable(),
  衛教: z.string().nullable(),
});

export function buildHpaSmokingCessationSourceId(name: string, address?: string | null): string {
  return `${name.trim()}|${(address || "").trim()}`.slice(0, 100);
}

/** `YYYY-MM-DD` this site's own sync captured the snapshot — same convention as childcareCenterShared.ts's `todayDataAsOf`, inlined here to avoid an unrelated cross-feature import for one line. */
function todayDataAsOf(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function fetchHpaSmokingCessationFacilities(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts. Also
  // deliberately httpRequest() (raw buffer), not httpGetText() — the ODS
  // file is a binary ZIP archive, and httpGetText() would lossily decode it
  // as UTF-8 text before we ever get to unzip it.
  const { status, buffer } = await httpRequest(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`HPA smoking-cessation facilities (6954) request failed: HTTP ${status}`);

  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find((e) => e.entryName === "content.xml");
  if (!entry) throw new Error("HPA smoking-cessation ODS contained no content.xml entry");
  const contentXml = entry.getData().toString("utf-8");

  const grid = parseOdsSheetRows(contentXml, SHEET_NAME);
  const raw = odsRowsToRecords(grid) as unknown as HpaSmokingCessationRawRow[];
  validateImportRows("HPA smoking-cessation facilities (6954)", hpaSmokingCessationRawSchema, raw);

  const dataAsOf = todayDataAsOf();

  return raw
    .filter((r) => r.院所名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(r.地址);
      return {
        facilityType: "smoking_cessation",
        sourceKey: "hpa_smoking_cessation_6954",
        sourceId: buildHpaSmokingCessationSourceId(r.院所名稱, address),
        name: r.院所名稱,
        address,
        phone: r.電話 ? toHalfwidthDigits(r.電話) : null,
        lat: null,
        lng: null,
        serviceItem: r.醫事機構類別 || null,
        serviceTime: null,
        dataOrg: "衛生福利部國民健康署（data.gov.tw 6954）",
        extra: {
          smokingMedication: r.給藥 === "V" ? "可提供戒菸藥品" : null,
          smokingEducation: r.衛教 === "V" ? "可提供戒菸衛教" : null,
          postalCode: r.郵遞區號 || null,
          dataAsOf,
        },
      };
    });
}
