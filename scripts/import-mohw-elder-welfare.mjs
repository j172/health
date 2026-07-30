#!/usr/bin/env node
/**
 * Fetches MOHW's 全國老人福利機構名冊 (nationwide elder welfare institution
 * directory, data.gov.tw dataset 8572 — one Big5-encoded CSV per county/
 * city, 22 files) and pushes the parsed records to production's
 * /api/admin/facilities-import endpoint.
 *
 * Why this runs locally instead of via the deployed app's own facilities-
 * sync: opendata.mohw.gov.tw is a mohw.gov.tw subdomain, the same apex
 * domain as ltcpap.mohw.gov.tw — which is confirmed unreachable from both
 * the production host and GitHub Actions runners (IP-range block). A
 * facilities-sync run attempting this source came back with zero rows and
 * no visible error (fire-and-forget endpoint, no per-source log surfaced),
 * consistent with the same block rather than a code bug — this script
 * (running on a regular residential/office network) confirms that.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-mohw-elder-welfare.mjs
 */
import iconv from "iconv-lite";

const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

const COUNTY_URLS = [
  { county: "南投縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%8D%97%E6%8A%95%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "嘉義市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%98%89%E7%BE%A9%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "嘉義縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%98%89%E7%BE%A9%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "基隆市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%9F%BA%E9%9A%86%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "宜蘭縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%AE%9C%E8%98%AD%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "屏東縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%B1%8F%E6%9D%B1%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "彰化縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%BD%B0%E5%8C%96%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "新北市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E6%96%B0%E5%8C%97%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "新竹市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E6%96%B0%E7%AB%B9%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "新竹縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E6%96%B0%E7%AB%B9%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "桃園市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E6%A1%83%E5%9C%92%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "澎湖縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E6%BE%8E%E6%B9%96%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "臺中市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E8%87%BA%E4%B8%AD%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "臺北市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E8%87%BA%E5%8C%97%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "臺南市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E8%87%BA%E5%8D%97%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "臺東縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E8%87%BA%E6%9D%B1%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "花蓮縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E8%8A%B1%E8%93%AE%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "苗栗縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E8%8B%97%E6%A0%97%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "連江縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E9%80%A3%E6%B1%9F%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "金門縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E9%87%91%E9%96%80%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "雲林縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E9%9B%B2%E6%9E%97%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "高雄市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E9%AB%98%E9%9B%84%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
];

// Full-text (not line-split-first) CSV parser — the 收容對象 column embeds
// literal newlines inside quoted fields (e.g. `"安養\n養護"`), which a
// split-on-newline-first parser would corrupt into bogus extra rows.
function parseCsv(text) {
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

const toHalfwidthDigits = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));

// A short unit (e.g. county+district, or just a truncated fragment of one)
// sometimes repeats back-to-back near the start of these addresses — see
// lib/server/facilities/csv.ts's dedupeAddressPrefix for the two confirmed
// live shapes this handles (e.g. a source row's county truncated to "中市"
// then a full "臺中市" prepended in front of it: "臺中市中市北屯區...").
const dedupeAddressPrefix = (address) => {
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

const normalizeAddress = (raw) => {
  const halfwidth = toHalfwidthDigits(raw);
  const firstAddress = halfwidth.split(/[,，]|及/)[0];
  const withoutParens = firstAddress.replace(/[（(][^）)]*[）)]/g, "");
  const deduped = dedupeAddressPrefix(withoutParens.trim());
  return deduped.replace(/\s+/g, " ").trim();
};

async function fetchCounty(county, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed for ${county}: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const text = iconv.decode(buffer, "big5");
  const rows = parseCsv(text);

  return rows
    .filter((r) => r["機構名稱"] && r["地址"])
    .map((r) => {
      const address = normalizeAddress(r["地址"].startsWith(county) ? r["地址"] : `${county}${r["地址"]}`);
      return {
        facilityType: "elder_welfare",
        sourceKey: "mohw_elder_welfare",
        sourceId: `${r["機構名稱"]}|${address}`.slice(0, 100),
        name: r["機構名稱"],
        address,
        phone: r["電話"] ? toHalfwidthDigits(r["電話"]) : null,
        lat: null,
        lng: null,
        serviceItem: r["收容對象"] ? r["收容對象"].replace(/\s*\n\s*/g, "、") : null,
        serviceTime: null,
        dataOrg: "衛福部",
      };
    });
}

async function fetchRecords() {
  const all = [];
  for (const { county, url } of COUNTY_URLS) {
    console.log(`Fetching ${county}...`);
    try {
      const records = await fetchCounty(county, url);
      console.log(`  ${records.length} institutions`);
      all.push(...records);
    } catch (err) {
      console.error(`  failed: ${err.message}`);
    }
  }
  return all;
}

async function submit(records) {
  const res = await fetch(`${BASE_URL}/api/admin/facilities-import`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-rss-sync-admin-secret": ADMIN_SECRET },
    body: JSON.stringify({ records }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(`Import failed: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const records = await fetchRecords();
  console.log(`Importing ${records.length} institutions total...`);
  const result = await submit(records);
  console.log("Import result:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
