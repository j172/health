#!/usr/bin/env node
/**
 * Backfills coordinates for NPA Child & Women Safety Alert Spots (child_safety_spot)
 * using open geospatial geocoding and landmark resolution.
 */
import { parseCsv, toHalfwidthDigits, normalizeAddress, submitFacilities } from "./lib/mohw-csv.mjs";

const SOURCE_URL =
  "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/DBB18796-8A89-4917-B4AB-D0AF26FAFEDC/resource/ADD554F1-FE8C-422C-8ACE-1E560D119E2A/download";
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET or RSS_SYNC_ADMIN_SECRET env var.");
  process.exit(1);
}

const RAW_ADDRESS_CORRECTIONS = new Map([["?裡海水浴場", "嵵裡海水浴場"]]);

function extractCityFromDept(deptNm) {
  if (!deptNm) return "";
  const match = deptNm.match(/^([^\s市縣]+[市縣])/);
  if (match) return match[1].replace(/政府$/, "");
  return "";
}

// Well-known Taipei / New Taipei / Taichung MRT stations & landmarks
const LANDMARK_COORDS = {
  "捷運中山站": { lat: 25.0531, lng: 121.5204 },
  "捷運劍潭站": { lat: 25.0849, lng: 121.5253 },
  "捷運大安站": { lat: 25.0329, lng: 121.5435 },
  "捷運南京三民站": { lat: 25.0519, lng: 121.5654 },
  "捷運中山國小站": { lat: 25.0628, lng: 121.5262 },
  "捷運古亭站": { lat: 25.0264, lng: 121.5229 },
  "捷運南港展覽館站": { lat: 25.0553, lng: 121.6174 },
  "捷運大橋頭站": { lat: 25.0631, lng: 121.5113 },
  "捷運忠孝敦化站": { lat: 25.0416, lng: 121.5504 },
  "捷運萬芳醫院站": { lat: 24.9984, lng: 121.5583 },
  "捷運中山國中站": { lat: 25.0608, lng: 121.5441 },
  "捷運西門站": { lat: 25.0421, lng: 121.5083 },
  "峨眉街、漢中街口": { lat: 25.0435, lng: 121.5068 },
  "文心中清捷運站": { lat: 24.1729, lng: 120.6729 },
  "嵵裡海水浴場": { lat: 23.5244, lng: 119.5786 },
  "大都會公園": { lat: 25.0560, lng: 121.4820 },
  "山外車站": { lat: 24.4414, lng: 118.4168 },
};

async function geocodeQuery(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=tw&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": "j172-health-childsafety-sync/1.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function main() {
  console.log("Downloading NPA child safety spots...");
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "j172-health-sync/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download NPA dataset`);

  const text = await res.text();
  const rows = parseCsv(text);
  const validRows = rows.filter(
    (r) => r.No && r.No !== "編號" && r.Address && r.Address !== "地點位置" && r.DeptNm !== "管轄警察局"
  );

  console.log(`Processing ${validRows.length} spots...`);

  // First, fetch existing DB records to check which ones already have coordinates
  const existingRes = await fetch(`${BASE_URL}/api/facilities?type=child_safety_spot&limit=300&_t=${Date.now()}`);
  const existingData = await existingRes.json();
  const existingCoordsMap = new Map();
  for (const f of existingData.facilities || []) {
    if (f.lat && f.lng) {
      existingCoordsMap.set(f.name, { lat: parseFloat(f.lat), lng: parseFloat(f.lng) });
    }
  }
  console.log(`Already geocoded in DB: ${existingCoordsMap.size}`);

  const records = [];
  let newlyGeocoded = 0;

  for (const r of validRows) {
    const rawNo = (r.No || "").trim();
    const rawAddr = (r.Address || "").trim();
    const dept = (r.DeptNm || "").trim();
    const branch = (r.BranchNm || "").trim();
    const contact = (r.Contact || "").trim();
    const phone = (r.ContactNumber || "").trim();

    const correctedAddr = RAW_ADDRESS_CORRECTIONS.get(rawAddr) ?? rawAddr;
    const city = extractCityFromDept(dept);
    const withCity = (addr) => (city && !addr.startsWith(city) ? `${city}${addr}` : addr);
    const sourceAddress = normalizeAddress(withCity(rawAddr));
    const address = normalizeAddress(withCity(correctedAddr));
    const displayName = `${correctedAddr} (${branch || dept})`;

    let coords = existingCoordsMap.get(displayName);

    if (!coords) {
      // Check landmark table
      for (const [landmark, c] of Object.entries(LANDMARK_COORDS)) {
        if (displayName.includes(landmark) || address.includes(landmark)) {
          coords = c;
          break;
        }
      }
    }

    if (!coords) {
      // Clean query for geocoding: strip trailing details like "與xx路口", "(xx分局)", "段", etc.
      let q = address
        .replace(/與.*路口.*/, "")
        .replace(/至.*路口.*/, "")
        .replace(/附近.*/, "")
        .replace(/[（(].*[）)]/, "")
        .trim();

      if (q.length >= 4) {
        coords = await geocodeQuery(q);
        if (coords) newlyGeocoded++;
        await new Promise((resolve) => setTimeout(resolve, 1100)); // Rate limit 1.1s
      }
    }

    if (coords) {
      records.push({
        facilityType: "child_safety_spot",
        sourceKey: "npa_child_safety_spot",
        sourceId: `npa_${rawNo}_${sourceAddress}`.slice(0, 100),
        name: displayName,
        address,
        phone: phone ? toHalfwidthDigits(phone) : null,
        lat: coords.lat,
        lng: coords.lng,
        serviceItem: `管轄：${dept} ${branch} | 窗口：${contact || "專人"}`,
        serviceTime: null,
        dataOrg: "內政部警政署",
        extra: {
          no: rawNo,
          dept,
          branch,
          contact,
          city,
        },
      });
    }
  }

  console.log(`Submitting ${records.length} records with coordinates (newly geocoded: ${newlyGeocoded})...`);
  const result = await submitFacilities(BASE_URL, ADMIN_SECRET, records);
  console.log("Result:", result);
}

main().catch(console.error);

