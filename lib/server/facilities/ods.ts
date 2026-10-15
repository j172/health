import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

/**
 * Minimal ODS (OpenDocument Spreadsheet) reader.
 *
 * No existing helper for this in the codebase as of issue #613 (confirmed by
 * searching for "ods"/"content.xml"/"AdmZip" across lib/server and scripts —
 * the existing AdmZip call sites, e.g. lib/server/drugs/sources/
 * tfdaDrugAppearance.ts, all unzip a JSON/CSV payload, not an actual
 * OpenDocument spreadsheet). This is the first one; a future ODS source
 * should import this rather than re-parsing content.xml from scratch.
 *
 * An .ods file is a ZIP archive; its sheet data lives in content.xml as
 * <table:table>/<table:table-row>/<table:table-cell>. Returns rows as plain
 * objects keyed by the first row's cell values (the header row), mirroring
 * parseCsv()'s shape (lib/server/facilities/csv.ts) — every raw-row Zod
 * schema and `.filter()`/`.map()` downstream of a tabular source already
 * expects that shape.
 *
 * Deliberately minimal — handles exactly the real-world shape confirmed
 * against data.gov.tw 130229's actual .ods export (issue #613):
 *   - `table:number-columns-repeated` for the huge run of blank trailing
 *     cells LibreOffice pads every row out to (confirmed: 16375 on the real
 *     file) — capped at CELL_REPEAT_CAP per cell so one filler cell can
 *     never balloon into tens of thousands of loop iterations.
 *   - `table:number-rows-repeated` for the single huge blank padding row at
 *     the sheet's end (confirmed: 1,047,235 on the real file) — capped at
 *     MAX_ROW_REPEAT; harmless either way since a row of all-blank cells is
 *     always skipped regardless of its repeat count.
 *   - a single plain `<text:p>` per cell (no rich-text runs).
 * Does NOT handle: multiple `<text:p>` paragraphs in one cell (joined with
 * "\n" if ever encountered, but untested against a real file), formulas,
 * multiple sheets (always reads the first `<table:table>` — i.e. "first
 * sheet" in the function name), or merged cells.
 */

// Defends against the thousands-of-blank-trailing-cells shape LibreOffice
// writes on every row — real tabular government data never legitimately
// repeats one cell's value this many times, so capping only ever discards
// padding, never real columns.
const CELL_REPEAT_CAP = 50;
// Defends against the single huge blank padding row at a sheet's end (see
// above) without ever materializing it — real data rows never legitimately
// repeat either, so this cap is never hit by anything that matters.
const MAX_ROW_REPEAT = 5;

interface OdsCellNode {
  "text:p"?: unknown;
  "table:table-cell"?: OdsCellNode | OdsCellNode[];
  "@_table:number-columns-repeated"?: string;
  "@_table:number-rows-repeated"?: string;
}

function cellText(cell: OdsCellNode | undefined): string {
  if (!cell || typeof cell !== "object") return "";
  let p = cell["text:p"];
  if (p === undefined || p === null) return "";
  if (Array.isArray(p)) {
    p = p.map((part) => (typeof part === "object" && part !== null ? ((part as Record<string, unknown>)["#text"] ?? "") : part)).join("\n");
  } else if (typeof p === "object") {
    p = (p as Record<string, unknown>)["#text"] ?? "";
  }
  return String(p);
}

/** `width === 0` means "no cap" (used only for the header row, which is trimmed of trailing blanks afterward). */
function expandRow(row: OdsCellNode, width: number): string[] {
  let cells = row["table:table-cell"];
  if (!cells) return [];
  if (!Array.isArray(cells)) cells = [cells];
  const out: string[] = [];
  for (const cell of cells) {
    const repeat = Math.min(Number(cell["@_table:number-columns-repeated"] ?? 1) || 1, CELL_REPEAT_CAP);
    const text = cellText(cell);
    for (let i = 0; i < repeat; i++) {
      if (width > 0 && out.length >= width) break;
      out.push(text);
    }
  }
  return out;
}

/** Reads the first sheet of an ODS file into header-keyed row objects. Throws on a malformed/non-spreadsheet file rather than silently returning no rows — same "fail loudly on a structural surprise" posture as validateImportRows. */
export function parseOdsFirstSheet(buffer: Buffer): Record<string, string>[] {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("content.xml");
  if (!entry) throw new Error("ODS file has no content.xml entry — not a valid OpenDocument spreadsheet");
  const xml = entry.getData().toString("utf-8");

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xml);
  const table = doc?.["office:document-content"]?.["office:body"]?.["office:spreadsheet"]?.["table:table"];
  if (!table) throw new Error("ODS file's content.xml has no office:spreadsheet/table:table");
  const tableNode: OdsCellNode = Array.isArray(table) ? table[0] : table;

  let rowNodes = (tableNode as unknown as { "table:table-row"?: OdsCellNode | OdsCellNode[] })["table:table-row"];
  if (!rowNodes) return [];
  if (!Array.isArray(rowNodes)) rowNodes = [rowNodes];
  if (rowNodes.length === 0) return [];

  const header = expandRow(rowNodes[0], 0);
  while (header.length > 0 && !header[header.length - 1].trim()) header.pop();
  const width = header.length;
  if (width === 0) return [];

  const dataRows: Record<string, string>[] = [];
  for (let i = 1; i < rowNodes.length; i++) {
    const row = rowNodes[i];
    const rowRepeat = Math.min(Number(row["@_table:number-rows-repeated"] ?? 1) || 1, MAX_ROW_REPEAT);
    const cells = expandRow(row, width);
    if (cells.every((c) => !c || !c.trim())) continue; // skip entirely-blank rows (incl. the sheet's trailing padding row)
    for (let r = 0; r < rowRepeat; r++) {
      const record: Record<string, string> = {};
      header.forEach((h, idx) => (record[h] = (cells[idx] ?? "").trim()));
      dataRows.push(record);
    }
  }
  return dataRows;
}
