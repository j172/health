#!/usr/bin/env node
/**
 * Resolves every searchName in COMMON_HOSPITAL_PATTERNS against the live
 * facilities data and reports what tier-1 news geocoding would pick.
 *
 * Why this exists (issue #84): five of the table's searchNames
 * (`臺北市立聯合醫院{和平,仁愛,中興,陽明,忠孝}院區`) were plausible-looking
 * names that no facility row actually carries. The regexes fired, the lookup
 * found nothing, and the article fell silently through to the county tier —
 * for months, with nothing anywhere reporting it. Another five named a family
 * of 4–18 hospitals, and `ORDER BY id ASC` picked whichever was imported
 * first. Neither failure is visible from the code alone; both are obvious the
 * moment you resolve the names against real rows, which is all this does.
 *
 * Read-only. It issues GETs against the public /api/facilities endpoint and
 * writes nothing, so it is safe to run against production at any time.
 *
 * Usage:
 *   node scripts/verify-hospital-search-names.mjs
 *   HEALTH_BASE_URL=http://localhost:3000 node scripts/verify-hospital-search-names.mjs
 *
 * Exits non-zero if any searchName resolves to nothing (a dead entry) or to
 * more than one candidate institution (an ambiguous entry) — both are defects.
 */

import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// The table and the ranking rule are TypeScript. Node >= 22.18 strips the types
// on its own; the hook only teaches it that an extensionless relative import
// means the .ts file, exactly as lib/**/*.test.mjs do.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(specifier + extension, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { COMMON_HOSPITAL_PATTERNS, selectFacilityMatch } = await import(
  "../lib/server/news/facilityMatch.ts"
);

const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";

/** Politeness gap between requests — this is ~50 GETs at a shared-host site. */
const REQUEST_INTERVAL_MS = Number(process.env.REQUEST_INTERVAL_MS || 400);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches the clinic rows whose NAME contains `searchName`.
 *
 * The endpoint's keyword filter is `name LIKE ? OR address LIKE ?`, one term
 * wider than findFacilityInDb's `name LIKE ?`, so the address hits are dropped
 * here. Rows without coordinates are dropped too, matching the SQL's
 * `lat IS NOT NULL AND lng IS NOT NULL`: a row tier 1 cannot place on a map is
 * not a candidate.
 *
 * Production rate-limits bursts with a 429, which on a read-only check means
 * "slow down", not "this name is dead" — so back off and retry rather than let
 * a throttled request masquerade as a zero-match result.
 */
async function fetchCandidates(searchName, attempt = 0) {
  const url = `${BASE_URL}/api/facilities?type=clinic&keyword=${encodeURIComponent(searchName)}`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (response.status === 429 && attempt < 5) {
    await sleep(2000 * 2 ** attempt);
    return fetchCandidates(searchName, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  return (body.facilities || [])
    .filter((row) => row.name && row.name.includes(searchName))
    .filter((row) => row.lat != null && row.lng != null)
    .sort((a, b) => a.id - b.id);
}

/** Every searchName in table order, de-duplicated, with its aliases. */
function distinctSearchNames() {
  const bySearchName = new Map();
  for (const { regex, searchName } of COMMON_HOSPITAL_PATTERNS) {
    const entry = bySearchName.get(searchName) || { searchName, regexes: [] };
    entry.regexes.push(String(regex));
    bySearchName.set(searchName, entry);
  }
  return [...bySearchName.values()];
}

const entries = distinctSearchNames();
console.log(
  `Resolving ${entries.length} distinct searchNames (${COMMON_HOSPITAL_PATTERNS.length} regex entries) against ${BASE_URL}\n`,
);

let dead = 0;
let ambiguous = 0;
let exactHits = 0;
let shortestHits = 0;

for (const [index, { searchName, regexes }] of entries.entries()) {
  if (index > 0) await sleep(REQUEST_INTERVAL_MS);
  const candidates = await fetchCandidates(searchName);
  const exact = candidates.filter((row) => row.name === searchName);
  const picked = selectFacilityMatch(candidates, searchName);

  const position = String(index + 1).padStart(2, " ");
  console.log(`${position}. ${searchName}`);
  console.log(`    aliases : ${regexes.join(" ")}`);
  console.log(
    `    matches : ${candidates.length} geocoded clinic row(s), exact-name row ${exact.length ? `YES (id ${exact[0].id})` : "no"}`,
  );

  if (!picked) {
    if (candidates.length === 0) {
      dead += 1;
      console.log("    RESULT  : DEAD — no clinic row contains this name\n");
    } else {
      ambiguous += 1;
      console.log(
        `    RESULT  : AMBIGUOUS — declines; tied shortest names: ${candidates
          .filter(
            (row) =>
              row.name.length ===
              Math.min(...candidates.map((other) => other.name.length)),
          )
          .map((row) => row.name)
          .join(" / ")}\n`,
      );
    }
    continue;
  }

  const rule = exact.length ? "exact name" : "shortest name";
  if (exact.length) exactHits += 1;
  else shortestHits += 1;
  console.log(
    `    RESULT  : id ${picked.id} ${picked.name}  (by ${rule}; ${BASE_URL}/facilities/${picked.id})\n`,
  );
}

console.log("---");
console.log(
  `resolved ${exactHits + shortestHits}/${entries.length}  (exact-name ${exactHits}, shortest-name ${shortestHits})`,
);
console.log(`declining ${ambiguous}  dead ${dead}`);

if (dead > 0 || ambiguous > 0) {
  console.error(
    "\nFAIL: every searchName must resolve to exactly one hospital. A dead entry is a regex that fires and finds nothing; an ambiguous one names a family, and should be split per institution or removed.",
  );
  process.exit(1);
}
console.log("\nOK: every searchName resolves to exactly one hospital.");
