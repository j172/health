// Shared by scripts/import-mohw-disability-welfare.mjs and
// scripts/import-mohw-elder-welfare.mjs — both parse a Big5-encoded MOHW CSV
// export and submit the resulting facility records to the same admin
// endpoint. facilities.mjs/ltc-contracted.mjs are NOT included here: their
// parseCsv/submit shapes genuinely differ (a line-based parser and a
// chunked-batch submit, respectively), so folding them in would change their
// behavior rather than just removing duplication.

// Full-text (not line-split-first) CSV parser — some MOHW exports embed
// literal newlines inside quoted fields, which a split-on-newline-first
// parser would corrupt into bogus extra rows.
export function parseCsv(text) {
  const cleaned = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
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
    const record = {};
    headers.forEach((h, i) => (record[h] = (cells[i] ?? "").trim()));
    return record;
  });
}

export const toHalfwidthDigits = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));

// A short unit (e.g. county+district, or just a truncated fragment of one)
// sometimes repeats back-to-back near the start of these addresses — see
// lib/server/facilities/csv.ts's dedupeAddressPrefix for the two confirmed
// live shapes this handles (e.g. a source row's county truncated to "中市"
// then a full "臺中市" prepended in front of it: "臺中市中市北屯區...").
export const dedupeAddressPrefix = (address) => {
  for (let len = 12; len >= 4; len--) {
    if (address.length >= len * 2 && address.slice(0, len) === address.slice(len, len * 2)) {
      return address.slice(len);
    }
  }
  for (let len = 2; len <= 4; len++) {
    for (let start = 0; start <= 4; start++) {
      const unit = address.slice(start, start + len);
      if (unit.length === len && unit === address.slice(start + len, start + len * 2)) {
        return address.slice(0, start + len) + address.slice(start + len * 2);
      }
    }
  }
  return address;
};

export const normalizeAddress = (raw) => {
  const halfwidth = toHalfwidthDigits(raw);
  const firstAddress = halfwidth.split(/[,，]|及/)[0];
  const withoutParens = firstAddress.replace(/[（(][^）)]*[）)]/g, "");
  const deduped = dedupeAddressPrefix(withoutParens.trim());
  return deduped.replace(/\s+/g, " ").trim();
};

export async function submitFacilities(baseUrl, adminSecret, records) {
  const res = await fetch(`${baseUrl}/api/admin/facilities-import`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-rss-sync-admin-secret": adminSecret },
    body: JSON.stringify({ records }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(`Import failed: ${JSON.stringify(json)}`);
  return json;
}
