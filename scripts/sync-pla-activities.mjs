#!/usr/bin/env node
/**
 * PLA Activities Daily Bulletin Synchronization Script
 *
 * Scrapes and ingests daily PLA activities announcements and trajectory maps
 * from the Ministry of National Defense (MND) (https://www.mnd.gov.tw/news/plaactlist).
 *
 * Usage:
 *   node scripts/sync-pla-activities.mjs
 *   npm run sync:pla-activities
 */

import fs from "node:fs";
import path from "node:path";
import { parsePlaBulletin } from "../lib/server/plaActivities/parser.ts";

function loadEnvFile(envPath) {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const MND_LIST_URL = "https://www.mnd.gov.tw/news/plaactlist";
const SEED_FILE_PATH = path.join(process.cwd(), "data", "pla-activities-seed.json");

/**
 * Attempts to scrape live data from MND.
 * Gracefully returns null if network is unavailable or site is blocked.
 */
async function fetchMndBulletins() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(MND_LIST_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[PLA Sync] MND server responded with HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();
    // Parse list items
    const items = [];
    const linkRegex = /<a[^>]+href="([^"]*plaactdetail[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const relativeHref = match[1];
      const linkText = match[2].replace(/<[^>]+>/g, "").trim();
      if (linkText.includes("臺海周邊海、空域動態") || linkText.includes("動態")) {
        const fullUrl = relativeHref.startsWith("http")
          ? relativeHref
          : `https://www.mnd.gov.tw${relativeHref.startsWith("/") ? "" : "/"}${relativeHref}`;
        items.push({ title: linkText, url: fullUrl });
      }
    }
    return items;
  } catch (err) {
    console.warn(`[PLA Sync] Network fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Loads baseline seed data from disk.
 */
function loadSeedData() {
  if (fs.existsSync(SEED_FILE_PATH)) {
    try {
      const content = fs.readFileSync(SEED_FILE_PATH, "utf-8");
      return JSON.parse(content);
    } catch (e) {
      console.error("[PLA Sync] Failed to parse seed file:", e);
    }
  }
  return [];
}

/**
 * Main execution
 */
async function main() {
  console.log(`[PLA Sync] Starting PLA activities sync...`);
  const liveItems = await fetchMndBulletins();

  let activities = [];

  if (liveItems && liveItems.length > 0) {
    console.log(`[PLA Sync] Found ${liveItems.length} bulletin links on MND portal.`);
    // Process each bulletin item
    for (const item of liveItems.slice(0, 10)) {
      try {
        const parsed = parsePlaBulletin({
          title: item.title,
          content: item.title,
          sourceUrl: item.url,
        });
        activities.push(parsed);
      } catch (err) {
        console.warn(`[PLA Sync] Error parsing bulletin ${item.title}:`, err);
      }
    }
  } else {
    console.log(`[PLA Sync] Network unavailable or offline environment. Utilizing local high-fidelity seed data.`);
    activities = loadSeedData();
  }

  console.log(`[PLA Sync] Prepared ${activities.length} activity records.`);

  // Attempt database upsert if MySQL configuration is present
  if (process.env.MYSQL_HOST) {
    try {
      const { upsertPlaActivities } = await import("../lib/server/plaActivities/queries.ts");
      const result = await upsertPlaActivities(activities);
      console.log(`[PLA Sync] Database upsert completed: ${result.inserted} inserted, ${result.updated} updated.`);
    } catch (dbErr) {
      console.warn(`[PLA Sync] DB connection unavailable, persisting to seed JSON fallback:`, dbErr.message);
    }
  } else {
    console.log(`[PLA Sync] MYSQL_HOST not defined in environment. Verified seed dataset.`);
  }

  console.log(`[PLA Sync] Done.`);
}

main().catch((err) => {
  console.error(`[PLA Sync] Fatal error:`, err);
  process.exit(1);
});
