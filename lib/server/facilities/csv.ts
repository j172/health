import iconv from "iconv-lite";

/** Decodes a Big5-encoded CSV buffer (common for older MOHW open-data exports) to a UTF-8 string. */
export const decodeBig5 = (buffer: Buffer): string => iconv.decode(buffer, "big5");

/**
 * CSV parser operating on the whole text as one character stream, not
 * line-split first — some MOHW exports (e.g. the elder-welfare-institution
 * dataset's 收容對象 column) embed literal newlines inside quoted fields
 * (e.g. `"安養\n養護"`), which a split-on-newline-first parser would corrupt
 * by treating as two separate rows. Handles quoted fields (with embedded
 * commas and newlines) and "" as an escaped quote.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const cleaned = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (inQuotes) {
      if (char === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r") {
      // skip — \n (below) ends the row
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
  if (nonEmptyRows.length === 0) return [];

  const headers = nonEmptyRows[0].map((h) => h.trim());
  return nonEmptyRows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => (record[h] = (cells[i] ?? "").trim()));
    return record;
  });
}

/** TFDA/MOL/NHI datasets frequently use fullwidth digits (０-９) in addresses/phones. */
export const toHalfwidthDigits = (s: string): string => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));

/**
 * Cleans up a raw government-dataset address for geocoding (and display):
 *   - fullwidth digits → halfwidth
 *   - drop parenthetical annotations, e.g. "（代表）", "(1樓)", "（環境職業醫學部）"
 *   - keep only the first address when multiple full addresses are listed,
 *     separated by a full/half-width comma or "及" ("and" — e.g. "…路56號，
 *     成功路182-2號" or "復興街5號、5之7號及文化一路15號" — genuinely different
 *     streets). A 、 (Chinese enumeration comma) on its own is left alone,
 *     since that far more often just lists multiple house numbers on the
 *     *same* street (e.g. "八德路2段424、426號") — splitting on it would chop
 *     the "號" unit off the first number.
 *   - collapse/trim whitespace
 */
export function normalizeAddress(raw: string): string {
  const halfwidth = toHalfwidthDigits(raw);
  const firstAddress = halfwidth.split(/[,，]|及/)[0];
  const withoutParens = firstAddress.replace(/[（(][^）)]*[）)]/g, "");
  return withoutParens.replace(/\s+/g, " ").trim();
}
