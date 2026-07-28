/** Minimal CSV parser — handles quoted fields (with embedded commas), no embedded newlines within fields. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
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
