#!/usr/bin/env node
/**
 * News geocoding and image backfill runner for GitHub Actions.
 * Calls /api/admin/news-geocode-batch and /api/admin/news-images sequentially
 * over SSH loopback or direct HTTP transport.
 *
 * Env:
 *   RSS_SYNC_ADMIN_SECRET
 *   NEWS_IMAGES_TRANSPORT=ssh|http (default ssh)
 *   NEWS_IMAGES_BASE_URL (http mode, default http://127.0.0.1:18080)
 *   SSH_HOST SSH_PORT SSH_USER SSH_KEY_FILE (ssh mode)
 *   NEWS_GEO_IMAGE_ROUNDS (default 10)
 */
import { spawnSync } from "node:child_process";

const TRANSPORT = (process.env.NEWS_IMAGES_TRANSPORT || "ssh").toLowerCase();
const BASE = (process.env.NEWS_IMAGES_BASE_URL || "http://127.0.0.1:18080").replace(/\/$/, "");
const SECRET = process.env.RSS_SYNC_ADMIN_SECRET || "";
const SSH_HOST = process.env.SSH_HOST || "";
const SSH_PORT = process.env.SSH_PORT || "22";
const SSH_USER = process.env.SSH_USER || "";
const SSH_KEY_FILE = process.env.SSH_KEY_FILE || "";
const ROUNDS = Math.min(50, Math.max(1, Number(process.env.NEWS_GEO_IMAGE_ROUNDS || 10)));

if (!SECRET) {
  console.error("Missing RSS_SYNC_ADMIN_SECRET");
  process.exit(1);
}

const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

const callEndpoint = (endpointPath, payload = {}) => {
  if (TRANSPORT === "http") {
    const url = `${BASE}${endpointPath}`;
    const result = spawnSync(
      "curl",
      [
        "-sS",
        "--max-time",
        "90",
        "-X",
        "POST",
        url,
        "-H",
        "content-type: application/json",
        "-H",
        `x-rss-sync-admin-secret: ${SECRET}`,
        "-d",
        JSON.stringify(payload),
      ],
      { encoding: "utf8" },
    );
    if (result.error) throw result.error;
    const out = (result.stdout || "").trim();
    const lines = out.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
    const text = lines.length ? lines[lines.length - 1] : out;
    return JSON.parse(text);
  }

  // SSH mode
  if (!SSH_HOST || !SSH_USER || !SSH_KEY_FILE) {
    throw new Error("SSH transport requires SSH_HOST, SSH_USER, and SSH_KEY_FILE");
  }

  const remote = [
    "curl -sS --max-time 90",
    `-X POST http://127.0.0.1:3000${endpointPath}`,
    '-H "content-type: application/json"',
    `-H ${shellQuote(`x-rss-sync-admin-secret: ${SECRET}`)}`,
    `-d ${shellQuote(JSON.stringify(payload))}`,
  ].join(" ");

  const result = spawnSync(
    "ssh",
    [
      "-i",
      SSH_KEY_FILE,
      "-p",
      String(SSH_PORT),
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ConnectTimeout=15",
      `${SSH_USER}@${SSH_HOST}`,
      remote,
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );

  if (result.error) throw result.error;
  const out = (result.stdout || "").trim();
  const lines = out.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
  const text = lines.length ? lines[lines.length - 1] : out;
  return JSON.parse(text);
};

console.log(`Starting news geo & image backfill (${ROUNDS} rounds, transport=${TRANSPORT})...`);

let totalGeocoded = 0;
let totalImagesAssigned = 0;

for (let r = 1; r <= ROUNDS; r += 1) {
  console.log(`\n--- Round ${r}/${ROUNDS} ---`);

  // Step 1: Geocoding Batch
  try {
    const geoRes = callEndpoint("/api/admin/news-geocode-batch", { limit: 20 });
    console.log(`[Geocode]`, JSON.stringify(geoRes.summary || geoRes));
    if (geoRes?.summary?.enriched) totalGeocoded += geoRes.summary.enriched;
  } catch (err) {
    console.error(`[Geocode Error]`, err.message);
  }

  // Step 2: Card Images Batch
  try {
    const imgRes = callEndpoint("/api/admin/news-images", { limit: 10 });
    console.log(`[Images]`, JSON.stringify(imgRes.summary || imgRes));
    if (imgRes?.summary?.assigned) totalImagesAssigned += imgRes.summary.assigned;
  } catch (err) {
    console.error(`[Images Error]`, err.message);
  }
}

console.log(`\nDone! Total Geocoded: ${totalGeocoded}, Total Images Assigned: ${totalImagesAssigned}`);
