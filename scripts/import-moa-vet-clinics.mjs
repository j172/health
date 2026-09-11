#!/usr/bin/env node
/**
 * scripts/import-moa-vet-clinics.mjs
 *
 * Ingests MOA's 獸醫診療機構名冊 (2,078 veterinary clinics across Taiwan),
 * normalizes addresses, infers coordinates from district centroids/cache,
 * writes data/facilities-seeds/vet-clinics-seed.json, and pushes to
 * production /api/admin/facilities-import if ADMIN_SECRET is provided.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { inferCoords } from "./dataset-helpers.mjs";

const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;
const SOURCE_URL = "https://data.moa.gov.tw/Service/OpenData/DataFileService.aspx?UnitId=078";
const OUTPUT_SEED = path.join(process.cwd(), "data", "facilities-seeds", "vet-clinics-seed.json");

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

function normalizeAddress(addr) {
  if (!addr) return "";
  return addr
    .replace(/[\s\r\n]/g, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[臺台]/g, "台")
    .trim();
}

async function run() {
  console.log(`Fetching MOA Vet Clinics dataset: ${SOURCE_URL}...`);
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 j172tw-healthz/1.0" },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch MOA dataset: HTTP ${res.status}`);
  }

  const raw = await res.json();
  if (!Array.isArray(raw)) {
    throw new Error("Expected JSON array from MOA vet clinics endpoint");
  }

  console.log(`Received ${raw.length} vet clinic records from MOA`);

  const records = [];
  let geocodedCount = 0;

  for (const item of raw) {
    const name = (item["機構名稱"] || "").trim();
    if (!name) continue;

    const county = (item["縣市"] || "").trim();
    const rawAddress = (item["機構地址"] || "").trim();
    const address = normalizeAddress(rawAddress);
    const phone = (item["機構電話"] || "").trim();
    const license = (item["字號"] || "").trim();
    const vetType = (item["執照類別"] || "獸醫師").trim();
    const vetName = (item["負責獸醫"] || "").trim();
    const status = (item["狀態"] || "開業").trim();
    const issueDate = (item["發照日期"] || "").trim();

    const coords = inferCoords(address, county);
    if (coords && coords.lat && coords.lng) {
      geocodedCount++;
    }

    const sourceId = license || sha256(`${name}-${address}`);

    records.push({
      facilityType: "vet_clinic",
      sourceKey: "moa_vet_clinic",
      sourceId,
      name,
      address,
      phone: phone || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      serviceItem: vetType,
      serviceTime: vetName ? `負責獸醫: ${vetName}` : null,
      dataOrg: "農業部動植物防疫檢疫署",
      extra: {
        county,
        licenseNumber: license,
        status,
        issueDate,
        vetName,
      },
    });
  }

  console.log(`Processed ${records.length} records (${geocodedCount} coordinate-matched)`);

  // Write seed file
  const seedDir = path.dirname(OUTPUT_SEED);
  if (!fs.existsSync(seedDir)) {
    fs.mkdirSync(seedDir, { recursive: true });
  }
  fs.writeFileSync(
    OUTPUT_SEED,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total: records.length,
        records,
      },
      null,
      2,
    ),
    "utf-8",
  );
  console.log(`Saved seed to ${OUTPUT_SEED}`);

  // Push to remote if secret is provided
  if (ADMIN_SECRET) {
    console.log(`Submitting records to ${BASE_URL}/api/admin/facilities-import...`);
    const CHUNK_SIZE = 500;
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const postRes = await fetch(`${BASE_URL}/api/admin/facilities-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rss-sync-admin-secret": ADMIN_SECRET,
        },
        body: JSON.stringify({ records: chunk }),
      });
      if (!postRes.ok) {
        console.warn(`  Chunk ${i / CHUNK_SIZE + 1} failed: HTTP ${postRes.status}`);
      } else {
        const json = await postRes.json();
        console.log(`  Chunk ${i / CHUNK_SIZE + 1}: ${JSON.stringify(json)}`);
      }
    }
  } else {
    console.log("No ADMIN_SECRET set. Local seed file generated successfully.");
  }
}

run().catch((err) => {
  console.error("Failed to import MOA vet clinics:", err);
  process.exit(1);
});
