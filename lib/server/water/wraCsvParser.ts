/**
 * Shared CSV parser for WRA's (經濟部水利署台灣自來水公司) stop-water feed —
 * `https://web.water.gov.tw/wateroffapi/openData/export/csv-utf8`.
 *
 * Extracted out of `lib/server/water/ingestWaterOutages.ts` (the legacy
 * `water_outages` pipeline) so the newer `lib/server/waterOutages/`
 * ingestion (table `wra_water_outages`, see
 * docs/specs/water-outages-live-ingestion-gap.md) can reuse the same
 * tokenizer instead of re-implementing CSV parsing from scratch. Both
 * pipelines hit the exact same endpoint, so they need the exact same
 * parsing behavior (BOM stripping, quoted-cell handling, CRLF newlines).
 */
export function parseWraCsv(text: string): Record<string, string>[] {
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
        } else inQuotes = false;
      } else cell += char;
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r") {
      // skip
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
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
