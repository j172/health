#!/usr/bin/env node
/**
 * Imports Public Art data from local file or Open Data API
 * and pushes it to /api/admin/culture-sync?type=public-art.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret> node scripts/import-public-art.mjs
 */

import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET =
  process.env.ADMIN_SECRET ||
  process.env.RSS_SYNC_ADMIN_SECRET ||
  "PiCy5Uzuh-_6sk6HhPm3mjzWxhbco2jh";

const PUBLIC_ART_API_URL =
  "https://publicartap.moc.gov.tw/data/api/artWork/openData";

async function loadPublicArtData() {
  const localFile = path.join(process.cwd(), "data", "public-art.json");
  if (fs.existsSync(localFile)) {
    console.log(`Loading public art from local file: ${localFile}`);
    try {
      const content = fs.readFileSync(localFile, "utf-8");
      const json = JSON.parse(content);
      if (Array.isArray(json) && json.length > 0) {
        console.log(`Loaded ${json.length} items from local file.`);
        return json;
      }
    } catch (e) {
      console.warn("Failed to parse local file, fetching from API:", e.message);
    }
  }

  console.log(`Fetching public art from Open Data API: ${PUBLIC_ART_API_URL}`);
  const res = await fetch(PUBLIC_ART_API_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) {
    throw new Error(`Open Data API returned status ${res.status}`);
  }
  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error("Open Data API did not return an array");
  }
  console.log(`Fetched ${json.length} items from remote API.`);
  return json;
}

async function submitChunk(records, chunkIndex, totalChunks) {
  console.log(
    `Submitting chunk ${chunkIndex + 1}/${totalChunks} (${records.length} records)...`
  );

  const res = await fetch(`${BASE_URL}/api/admin/culture-sync?type=public-art`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rss-sync-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify({ publicArtRecords: records }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || "Unknown sync error");
  }

  return json;
}

async function main() {
  const allItems = await loadPublicArtData();
  const CHUNK_SIZE = 500;
  const totalChunks = Math.ceil(allItems.length / CHUNK_SIZE);

  console.log(`Starting import of ${allItems.length} records in ${totalChunks} chunks...`);

  let totalInsertedOrUpdated = 0;

  for (let i = 0; i < totalChunks; i++) {
    const chunk = allItems.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const result = await submitChunk(chunk, i, totalChunks);
    totalInsertedOrUpdated +=
      result?.results?.publicArt?.insertedOrUpdated || chunk.length;
  }

  console.log(`✅ Successfully imported public art data! Total processed: ${totalInsertedOrUpdated}`);
}

main().catch((err) => {
  console.error("❌ Import failed:", err);
  process.exit(1);
});

