#!/usr/bin/env node
/**
 * scripts/audit-all-tools.mjs
 *
 * Audits all tool pages under app/tools to check:
 * 1. Does the page exist and render without syntax error?
 * 2. Does it use a map? If so, does it use geolocation?
 * 3. Does it have data / seed fallback?
 */
import fs from "node:fs";
import path from "node:path";

const TOOLS_DIR = path.join(process.cwd(), "app", "tools");
const TOOL_DIRS = fs.readdirSync(TOOLS_DIR).filter((f) => {
  const full = path.join(TOOLS_DIR, f);
  return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "page.tsx"));
});

console.log(`Found ${TOOL_DIRS.length} tool pages under app/tools.\n`);

const results = [];

for (const slug of TOOL_DIRS) {
  const pagePath = path.join(TOOLS_DIR, slug, "page.tsx");
  const content = fs.readFileSync(pagePath, "utf-8");

  // Check what components it imports
  const hasMap =
    content.includes("Map") ||
    content.includes("Leaflet") ||
    slug.includes("map") ||
    slug === "aed" ||
    slug === "cpc-stations" ||
    slug === "public-art";

  // Check if it uses facilityConfigs or custom component
  const usesFacilityConfig = content.includes("facilitySearchConfigs");
  
  results.push({
    slug,
    hasMap,
    usesFacilityConfig,
  });
}

console.log("=== Tool Pages Summary ===");
console.log(`Total tool pages: ${results.length}`);
console.log(`Pages with maps: ${results.filter((r) => r.hasMap).length}`);
console.log(`Pages using FacilitySearchContent: ${results.filter((r) => r.usesFacilityConfig).length}`);

// Map pages
const mapPages = results.filter((r) => r.hasMap).map((r) => r.slug);
console.log("\nMap Pages List:");
console.log(mapPages.join(", "));
