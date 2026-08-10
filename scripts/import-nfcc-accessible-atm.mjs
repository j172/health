#!/usr/bin/env node
/**
 * Fetches NFCC's (中華民國信用合作社聯合社) two accessible-ATM CSV feeds —
 * wheelchair-accessible ATMs and voice-guided ATMs — merges rows that
 * describe the same physical ATM installation, and pushes the combined
 * records to production's /api/admin/facilities-import endpoint.
 *
 * Unlike scripts/import-mohw-disability-welfare.mjs (which MUST run locally
 * because opendata.mohw.gov.tw is blocked from the production host and
 * GitHub Actions runners), nfcc.org.tw has no known reachability issue —
 * this still runs as a standalone script rather than a registered
 * lib/server/facilities/sources/*.ts fetcher purely to keep this small,
 * rarely-changing two-CSV source simple and self-contained, matching the
 * MOHW scripts' shape as directed by docs/specs/phase2-disability-accessible-atm.md.
 *
 * Merge key: the spec's "join by 代號 (branch code) alone" turned out not to
 * hold — 代號 identifies the credit union, not the individual ATM location;
 * a single 代號 repeats across many distinct addresses/branches of the same
 * union in the wheel list (e.g. 代號 132 新竹三信 appears 14 times, one row
 * per branch). Joining on bare 代號 would incorrectly merge unrelated
 * branches of the same union into one facility, and using bare 代號 as
 * source_id would violate the facilities table's UNIQUE KEY
 * (source_key, source_id) — later rows with the same 代號 would silently
 * overwrite earlier ones. Instead this joins (and derives source_id) from
 * `代號 + 設置地址's bracketed branch annotation` (e.g. "132|竹北分社"),
 * falling back to the normalized address when a row has no bracket
 * annotation. This still satisfies the spec's intent (merge the same
 * physical ATM's wheelchair/voice rows into one facility, keyed by a value
 * stable across sync runs) while actually being unique per row.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-nfcc-accessible-atm.mjs
 */
import { parseCsv, toHalfwidthDigits, normalizeAddress, submitFacilities } from "./lib/mohw-csv.mjs";

const WHEEL_URL = "https://www.nfcc.org.tw/data/commoncharge/atm_wheel_list.csv";
const VOICE_URL = "https://www.nfcc.org.tw/data/commoncharge/atm_voice_list.csv";
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

// Matches both ASCII "[...]" and full-width "［...］" bracket pairs — the
// source data uses ASCII brackets throughout the sampled rows, full-width is
// handled defensively in case a future export mixes widths.
const BRACKET_RE = /[［\[]([^］\]]*)[］\]]/;

const parseBranchLabel = (rawAddress) => {
  const m = rawAddress.match(BRACKET_RE);
  return m ? m[1].trim() : null;
};

const stripBracket = (rawAddress) => rawAddress.replace(BRACKET_RE, "").trim();

// The address column header itself carries a bracketed explanatory suffix
// that differs between the two CSVs (e.g. "設置地址[含分社名稱...]" vs
// "設置地址[另請註明地點...]"), so it can't be looked up by exact key —
// find whichever parsed header starts with "設置地址".
const addressField = (row) => {
  const key = Object.keys(row).find((k) => k.startsWith("設置地址"));
  return key ? row[key] : "";
};

// Best-effort phone extraction from the wheel list's free-text "設置地點聯絡
// 電話與聯絡人" field, which mixes a phone number with a contact name and
// sometimes business-hours notes across embedded newlines (e.g.
// `"營業時間：(02)26252005資訊室\n非營業時間：(06)2912111南資中心"`). Grabs
// the first phone-shaped substring; returns null if nothing matches rather
// than guessing.
const PHONE_RE = /[(（\[]?0\d{1,2}[)）\]]?[-–－\s]?\d{3,4}[-–－\s]?\d{3,4}(?:\s*(?:轉|#)\s*\d+)?/;

const parsePhone = (raw) => {
  if (!raw) return null;
  const m = toHalfwidthDigits(raw).match(PHONE_RE);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
};

async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log(`  ${url}: downloaded ${buffer.length} bytes`);
  // Confirmed UTF-8 (with BOM) via header/byte sniffing, unlike the
  // Big5-encoded MOHW CSVs — no iconv-lite decoding needed here.
  return parseCsv(buffer.toString("utf8"));
}

// Keyed by `代號|branch label (or normalized address fallback)`.
function branchKey(code, label, normalizedAddress) {
  return `${code}|${label || normalizedAddress}`.slice(0, 100);
}

async function fetchRecords() {
  console.log("Fetching NFCC accessible-ATM lists...");
  const [wheelRows, voiceRows] = await Promise.all([fetchCsv(WHEEL_URL), fetchCsv(VOICE_URL)]);
  console.log(`  ${wheelRows.length} wheelchair-ATM rows, ${voiceRows.length} voice-ATM rows`);

  const merged = new Map();

  for (const r of wheelRows) {
    const code = r["代號"];
    const union = r["信合社"];
    const rawAddress = addressField(r);
    if (!code || !union || !rawAddress) continue;
    const label = parseBranchLabel(rawAddress);
    const address = normalizeAddress(stripBracket(rawAddress));
    const key = branchKey(code, label, address);
    merged.set(key, {
      code,
      union,
      label,
      address,
      phone: parsePhone(r["設置地點聯絡電話與聯絡人"]),
      wheel: true,
      voice: false,
    });
  }

  for (const r of voiceRows) {
    const code = r["代號"];
    const union = r["信合社"];
    const rawAddress = addressField(r);
    if (!code || !union || !rawAddress) continue;
    const label = parseBranchLabel(rawAddress);
    const address = normalizeAddress(stripBracket(rawAddress));
    const key = branchKey(code, label, address);
    const existing = merged.get(key);
    if (existing) {
      existing.voice = true;
    } else {
      merged.set(key, { code, union, label, address, phone: null, wheel: false, voice: true });
    }
  }

  return [...merged.entries()].map(([key, r]) => {
    const serviceItem = r.wheel && r.voice ? "輪椅可及、語音服務" : r.wheel ? "輪椅可及" : "語音服務";
    return {
      facilityType: "disability_atm",
      sourceKey: "nfcc_accessible_atm",
      sourceId: key,
      name: r.label ? `${r.union}${r.label}` : r.union,
      address: r.address,
      phone: r.phone,
      lat: null,
      lng: null,
      serviceItem,
      serviceTime: null,
      dataOrg: "中華民國信用合作社聯合社",
    };
  });
}

async function main() {
  const records = await fetchRecords();
  console.log(`Importing ${records.length} merged accessible-ATM records...`);
  const result = await submitFacilities(BASE_URL, ADMIN_SECRET, records);
  console.log("Import result:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
