#!/usr/bin/env node
/**
 * Enriches and backfills coordinates for NFCC accessible-ATMs.
 */
import { parseCsv, toHalfwidthDigits, normalizeAddress, submitFacilities } from "./lib/mohw-csv.mjs";

const WHEEL_URL = "https://www.nfcc.org.tw/data/commoncharge/atm_wheel_list.csv";
const VOICE_URL = "https://www.nfcc.org.tw/data/commoncharge/atm_voice_list.csv";
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET or RSS_SYNC_ADMIN_SECRET env var.");
  process.exit(1);
}

const BRACKET_RE = /[［\[]([^］\]]*)[］\]]/;

const parseBranchLabel = (rawAddress) => {
  const m = rawAddress.match(BRACKET_RE);
  return m ? m[1].trim() : null;
};

const stripBracket = (rawAddress) => rawAddress.replace(BRACKET_RE, "").trim();

const addressField = (row) => {
  const key = Object.keys(row).find((k) => k.startsWith("設置地址"));
  return key ? row[key] : "";
};

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
  return parseCsv(buffer.toString("utf8"));
}

function branchKey(code, label, normalizedAddress) {
  return `${code}|${label || normalizedAddress}`.slice(0, 100);
}

const KNOWN_ATM_COORDS = {
  "台中二信西屯分社騎樓": { lat: 24.1814534, lng: 120.6369761 },
  "嘉義三信忠孝分社": { lat: 23.4805210, lng: 120.4578120 },
  "彰化一信員林分社": { lat: 23.9606566, lng: 120.5820416 },
  "彰化六信華陽分社": { lat: 24.0749982, lng: 120.5465272 },
  "彰化六信觀音亭口分社": { lat: 24.0722900, lng: 120.5394254 },
  "新竹三信延平分社": { lat: 24.8050427, lng: 120.9516504 },
  "新竹三信香山分社": { lat: 24.7903648, lng: 120.9307392 },
  "桃園信用南華分社": { lat: 24.9910227, lng: 121.3036363 },
  "桃園信用大林分社": { lat: 24.9840427, lng: 121.3129819 },
  "淡水一信馬偕護專": { lat: 25.2536692, lng: 121.4951940 },
  "淡水一信馬偕醫學院": { lat: 25.2536692, lng: 121.4951940 },
  "澎湖二信立榮航空公司櫃台對面": { lat: 23.5687880, lng: 119.6290090 },
  "花蓮一信美崙分社": { lat: 23.9974063, lng: 121.6310531 },
  "花蓮二信壽豐分社": { lat: 23.8707264, lng: 121.5102029 },
  "花蓮二信大雅分社": { lat: 24.2240978, lng: 120.6475625 },
  "花蓮二信慈濟中學": { lat: 23.9981240, lng: 121.5832100 },
  "花蓮二信美崙分社": { lat: 23.9974063, lng: 121.6310531 }
};

async function main() {
  console.log("Fetching NFCC accessible-ATM lists...");
  const [wheelRows, voiceRows] = await Promise.all([fetchCsv(WHEEL_URL), fetchCsv(VOICE_URL)]);
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

  const records = [...merged.entries()].map(([key, r]) => {
    const serviceItem = r.wheel && r.voice ? "輪椅可及、語音服務" : r.wheel ? "輪椅可及" : "語音服務";
    const name = r.label ? `${r.union}${r.label}` : r.union;
    const known = KNOWN_ATM_COORDS[name];
    return {
      facilityType: "disability_atm",
      sourceKey: "nfcc_accessible_atm",
      sourceId: key,
      name,
      address: r.address,
      phone: r.phone,
      lat: known ? known.lat : null,
      lng: known ? known.lng : null,
      serviceItem,
      serviceTime: null,
      dataOrg: "中華民國信用合作社聯合社",
    };
  });

  const recordsWithCoords = records.filter(r => r.lat != null && r.lng != null);
  console.log(`Submitting ${recordsWithCoords.length} ATMs with coordinates...`);
  const result = await submitFacilities(BASE_URL, ADMIN_SECRET, recordsWithCoords);
  console.log("Result:", result);
}

main().catch(console.error);

