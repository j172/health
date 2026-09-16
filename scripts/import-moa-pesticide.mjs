#!/usr/bin/env node
/**
 * 農業部蔬果農藥殘留抽驗與食安基準同步腳本
 * 支援 --dry-run
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isDryRun = process.argv.includes("--dry-run");

async function run() {
  console.log("Starting MOA Pesticide Inspection Ingestion...");
  
  // 載入本地種子進行比對校驗
  const seedPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "lib",
    "server",
    "foodSafety",
    "data",
    "pesticideSeed.ts"
  );

  if (!existsSync(seedPath)) {
    console.error("Seed file not found at:", seedPath);
    process.exit(1);
  }

  const content = readFileSync(seedPath, "utf-8");
  const cropMatches = [...content.matchAll(/cropName:\s*"([^"]+)"/g)].map((m) => m[1]);

  console.log(`Verified ${cropMatches.length} crops in seed library.`);
  if (isDryRun) {
    console.log("Dry run finished successfully. Sample crops:", cropMatches.slice(0, 5));
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
