import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

// Issue #774 (parent #773) — 武裝衝突 (conflicts) item, GDELT-only. Mirrors
// the loader-hook convention tests/global-watch-587.test.mjs established and
// tests/global-watch-593-typhoons.test.mjs/tests/global-watch-594-disasters.test.mjs
// already follow: lib/server/conflicts/queries.ts and lib/server/conflicts/
// runSync.ts both pull in lib/server/db/mysql.ts (which throws at import
// time without MYSQL_HOST etc. set — see lib/server/cwa/filterAlertsByCounty.ts's
// own doc comment on exactly this constraint), so this file only ever
// imports the DB-import-free pure modules directly and falls back to
// source-text assertions for anything that touches the DB.
const REPO_ROOT = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const source = fs.readFileSync(fileURLToPath(url), "utf8");
      return { format: "json", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const ROOT_DIR = path.join(fileURLToPath(REPO_ROOT));
const readSrc = (...segments) => fs.readFileSync(path.join(ROOT_DIR, ...segments), "utf-8");

const { CAMEO_CONFLICT_ROOT_CODES, CAMEO_CONFLICT_ROOT_LABELS, isCameoConflictRootCode } = await import(
  "../lib/server/gdelt/cameoConflictCodes.ts"
);
const {
  parseGdeltLastUpdateText,
  parseGdeltEventRow,
  parseGdeltEventExportText,
  extractGdeltExportCsvText,
} = await import("../lib/server/gdelt/sources/gdelt.ts");
const { toMysqlDateUtc } = await import("../lib/server/gdelt/types.ts");
const { buildConflictsGlobeData, CONFLICT_LEGEND } = await import("../lib/tools/globeWatch/conflictsTransform.ts");
const { CONFLICT_ROOT_NAMES, resolveConflictRootColor, resolveConflictRootName, isConflictCameoRootCode } =
  await import("../lib/tools/globeWatch/conflictCameoRootNames.ts");

// ---------------------------------------------------------------------------
// CAMEO allowlist (AC: 具名、有文件說明的常數，不是自由文字比對)
// ---------------------------------------------------------------------------

test("CAMEO_CONFLICT_ROOT_CODES is exactly the two documented root codes, 19 (FIGHT) and 20 (USE UNCONVENTIONAL MASS VIOLENCE)", () => {
  assert.deepEqual(CAMEO_CONFLICT_ROOT_CODES, ["19", "20"]);
  assert.equal(CAMEO_CONFLICT_ROOT_LABELS["19"].cameoLabel, "FIGHT");
  assert.equal(CAMEO_CONFLICT_ROOT_LABELS["20"].cameoLabel, "USE UNCONVENTIONAL MASS VIOLENCE");
});

test("isCameoConflictRootCode accepts only '19'/'20', rejecting every other CAMEO root category and non-numeric junk", () => {
  assert.equal(isCameoConflictRootCode("19"), true);
  assert.equal(isCameoConflictRootCode("20"), true);
  assert.equal(isCameoConflictRootCode("01"), false, "01 MAKE PUBLIC STATEMENT must not pass");
  assert.equal(isCameoConflictRootCode("18"), false, "18 ASSAULT must not pass (coercive acts short of armed conflict)");
  assert.equal(isCameoConflictRootCode(""), false);
  assert.equal(isCameoConflictRootCode(null), false);
  assert.equal(isCameoConflictRootCode(undefined), false);
});

// ---------------------------------------------------------------------------
// GDELT fetch/parse pure functions
// ---------------------------------------------------------------------------

test("parseGdeltLastUpdateText picks the .export.CSV.zip line out of the 3-line index, ignoring mentions/gkg", () => {
  const text = [
    "79916 9d652be46729dab6f8b1f88eafb7a3e3 http://data.gdeltproject.org/gdeltv2/20261021200000.export.CSV.zip",
    "147286 29a65a2f9c733083265ce0d348c1ab69 http://data.gdeltproject.org/gdeltv2/20261021200000.mentions.CSV.zip",
    "6227582 48e9e2f2af1eaf0113a5cda2d2435784 http://data.gdeltproject.org/gdeltv2/20261021200000.gkg.csv.zip",
  ].join("\n");
  assert.deepEqual(parseGdeltLastUpdateText(text), {
    exportZipUrl: "http://data.gdeltproject.org/gdeltv2/20261021200000.export.CSV.zip",
  });
});

test("parseGdeltLastUpdateText returns a null exportZipUrl for malformed/empty input instead of throwing", () => {
  assert.deepEqual(parseGdeltLastUpdateText(""), { exportZipUrl: null });
  assert.deepEqual(parseGdeltLastUpdateText("not a valid index file at all"), { exportZipUrl: null });
});

test("toMysqlDateUtc converts GDELT's YYYYMMDD SQLDATE into a MySQL DATE string", () => {
  assert.equal(toMysqlDateUtc("20261021"), "2026-10-21");
  assert.equal(toMysqlDateUtc("2026-10-21"), null, "not 8 digits — rejected rather than guessed");
  assert.equal(toMysqlDateUtc(""), null);
});

const COLUMN_INDEX = {
  GLOBALEVENTID: 0,
  SQLDATE: 1,
  Actor1Name: 6,
  Actor2Name: 16,
  EventRootCode: 28,
  ActionGeo_FullName: 52,
  ActionGeo_CountryCode: 53,
  ActionGeo_Lat: 56,
  ActionGeo_Long: 57,
  SOURCEURL: 60,
};

function makeGdeltFields(overrides = {}) {
  const fields = new Array(61).fill("");
  const defaults = {
    GLOBALEVENTID: "1000987654",
    SQLDATE: "20261021",
    Actor1Name: "UKRAINE",
    Actor2Name: "RUSSIA",
    EventRootCode: "19",
    ActionGeo_FullName: "Kyiv, Kyiv, Ukraine",
    ActionGeo_CountryCode: "UP",
    ActionGeo_Lat: "50.45",
    ActionGeo_Long: "30.52",
    SOURCEURL: "https://example.com/news/article-1",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    fields[COLUMN_INDEX[key]] = value;
  }
  return fields;
}

test("parseGdeltEventRow parses a well-formed CAMEO-19 row into an IncomingConflictEvent", () => {
  const row = parseGdeltEventRow(makeGdeltFields());
  assert.ok(row);
  assert.equal(row.source, "gdelt");
  assert.equal(row.sourceEventId, "1000987654");
  assert.equal(row.eventDate, "2026-10-21");
  assert.equal(row.countryIso, "UP");
  assert.equal(row.countryName, "Kyiv, Kyiv, Ukraine");
  assert.equal(row.lat, 50.45);
  assert.equal(row.lng, 30.52);
  assert.equal(row.fatalitiesEstimate, null);
  assert.equal(row.rootCode, "19");
  assert.equal(row.sourceUrl, "https://example.com/news/article-1");
  assert.match(row.description, /UKRAINE/);
  assert.match(row.description, /RUSSIA/);
});

test("parseGdeltEventRow parses a CAMEO-20 row too", () => {
  const row = parseGdeltEventRow(makeGdeltFields({ EventRootCode: "20", GLOBALEVENTID: "2000000001" }));
  assert.ok(row);
  assert.equal(row.rootCode, "20");
});

test("parseGdeltEventRow drops a row whose EventRootCode isn't 19/20 — the core AC: 只篩選 CAMEO 19/20, not a free-text match", () => {
  for (const rootCode of ["01", "02", "10", "18", "99", ""]) {
    const row = parseGdeltEventRow(makeGdeltFields({ EventRootCode: rootCode }));
    assert.equal(row, null, `root code "${rootCode}" must be dropped`);
  }
});

test("parseGdeltEventRow drops a row with no GLOBALEVENTID, unparseable SQLDATE, non-numeric lat/lng, or too few columns", () => {
  assert.equal(parseGdeltEventRow(makeGdeltFields({ GLOBALEVENTID: "" })), null);
  assert.equal(parseGdeltEventRow(makeGdeltFields({ SQLDATE: "not-a-date" })), null);
  assert.equal(parseGdeltEventRow(makeGdeltFields({ ActionGeo_Lat: "not-a-number" })), null);
  assert.equal(parseGdeltEventRow(makeGdeltFields({ ActionGeo_Long: "" })), null);
  assert.equal(parseGdeltEventRow(["1", "20261021"]), null, "far too few columns");
});

test("parseGdeltEventRow builds a short description even when both actor names are missing, falling back to the location", () => {
  const row = parseGdeltEventRow(makeGdeltFields({ Actor1Name: "", Actor2Name: "" }));
  assert.ok(row);
  assert.equal(row.description, "Kyiv, Kyiv, Ukraine");
});

test("parseGdeltEventExportText filters a mixed-root-code export down to only the CAMEO 19/20 rows, ignoring blank lines", () => {
  const lines = [
    makeGdeltFields({ GLOBALEVENTID: "1", EventRootCode: "01" }).join("\t"),
    makeGdeltFields({ GLOBALEVENTID: "2", EventRootCode: "19" }).join("\t"),
    "",
    makeGdeltFields({ GLOBALEVENTID: "3", EventRootCode: "20" }).join("\t"),
    makeGdeltFields({ GLOBALEVENTID: "4", EventRootCode: "14" }).join("\t"),
  ];
  const rows = parseGdeltEventExportText(lines.join("\n"));
  assert.deepEqual(
    rows.map((r) => r.sourceEventId).sort(),
    ["2", "3"],
  );
});

test("extractGdeltExportCsvText reads the single .CSV entry out of a GDELT-shaped zip buffer", () => {
  const zip = new AdmZip();
  const csvLine = makeGdeltFields().join("\t");
  zip.addFile("20261021200000.export.CSV", Buffer.from(csvLine, "utf-8"));
  const text = extractGdeltExportCsvText(zip.toBuffer());
  assert.equal(text, csvLine);
});

test("extractGdeltExportCsvText throws when the zip has no .CSV entry, rather than silently returning nothing", () => {
  const zip = new AdmZip();
  zip.addFile("readme.txt", Buffer.from("not a csv"));
  assert.throws(() => extractGdeltExportCsvText(zip.toBuffer()), /no \.CSV entry/);
});

// ---------------------------------------------------------------------------
// lib/tools/globeWatch/conflictCameoRootNames.ts
// ---------------------------------------------------------------------------

test("conflict root codes reuse GDACS's Orange/Red severity colors (19 = Orange, 20 = Red), each distinct", () => {
  assert.equal(CONFLICT_ROOT_NAMES["19"].color, "#f97316");
  assert.equal(CONFLICT_ROOT_NAMES["20"].color, "#dc2626");
  assert.notEqual(CONFLICT_ROOT_NAMES["19"].color, CONFLICT_ROOT_NAMES["20"].color);
});

test("resolveConflictRootColor/resolveConflictRootName fall back to a neutral color / the raw code verbatim for an unrecognized code", () => {
  assert.equal(resolveConflictRootColor("99"), "#94a3b8");
  assert.equal(resolveConflictRootName("99", "en"), "99");
  assert.equal(isConflictCameoRootCode("99"), false);
});

test("resolveConflictRootName returns complete, distinct zh/en/ja/ko text for both root codes", () => {
  for (const code of ["19", "20"]) {
    const texts = ["zh-TW", "en", "ja", "ko"].map((locale) => resolveConflictRootName(code, locale));
    for (const text of texts) assert.ok(text && text.trim().length > 0);
    assert.equal(new Set(texts).size, 4, `expected 4 distinct translations for root ${code}`);
  }
});

// ---------------------------------------------------------------------------
// lib/tools/globeWatch/conflictsTransform.ts
// ---------------------------------------------------------------------------

function makeConflictRow(overrides = {}) {
  return {
    sourceEventId: "1000987654",
    eventDate: "2026-10-21",
    countryIso: "UP",
    countryName: "Kyiv, Kyiv, Ukraine",
    lat: 50.45,
    lng: 30.52,
    fatalitiesEstimate: null,
    rootCode: "19",
    description: "UKRAINE ↔ RUSSIA",
    sourceUrl: "https://example.com/news/article-1",
    ...overrides,
  };
}

test("buildConflictsGlobeData never throws on empty input and returns well-formed empty collections", () => {
  const data = buildConflictsGlobeData([]);
  assert.deepEqual(data.featureCollection, { type: "FeatureCollection", features: [] });
  assert.deepEqual(data.listItems, []);
  assert.equal(data.emptyState, true);
});

test("buildConflictsGlobeData maps every row into a point feature and a list item with a 'gdelt' sources tag", () => {
  const data = buildConflictsGlobeData([makeConflictRow()]);
  assert.equal(data.emptyState, false);
  assert.equal(data.featureCollection.features.length, 1);
  const feature = data.featureCollection.features[0];
  assert.deepEqual(feature.geometry.coordinates, [30.52, 50.45]);
  assert.deepEqual(feature.properties.sources, ["gdelt"]);
  assert.equal(feature.properties.markerColor, "#f97316");
  assert.equal(data.listItems.length, 1);
  assert.equal(data.listItems[0].lat, 50.45);
  assert.equal(data.listItems[0].lng, 30.52);
});

test("buildConflictsGlobeData sorts listItems most-recent-event-date first", () => {
  const data = buildConflictsGlobeData([
    makeConflictRow({ sourceEventId: "old", eventDate: "2026-09-01" }),
    makeConflictRow({ sourceEventId: "new", eventDate: "2026-10-21" }),
    makeConflictRow({ sourceEventId: "mid", eventDate: "2026-10-01" }),
  ]);
  assert.deepEqual(data.listItems.map((i) => i.sourceEventId), ["new", "mid", "old"]);
});

test("buildConflictsGlobeData defensively drops a row with a non-finite lat/lng rather than crashing", () => {
  const data = buildConflictsGlobeData([makeConflictRow({ lat: NaN })]);
  assert.equal(data.listItems.length, 0);
  assert.equal(data.emptyState, true);
});

test("buildConflictsGlobeData colors root-20 rows red and root-19 rows orange, matching CONFLICT_LEGEND", () => {
  const data = buildConflictsGlobeData([
    makeConflictRow({ sourceEventId: "a", rootCode: "19" }),
    makeConflictRow({ sourceEventId: "b", rootCode: "20" }),
  ]);
  const byId = Object.fromEntries(data.listItems.map((i) => [i.sourceEventId, i]));
  assert.equal(byId.a.markerColor, "#f97316");
  assert.equal(byId.b.markerColor, "#dc2626");

  const legendColors = new Set(CONFLICT_LEGEND.map((e) => e.color));
  assert.equal(legendColors.size, 2);
  assert.ok(CONFLICT_LEGEND.some((e) => e.color === "#f97316"));
  assert.ok(CONFLICT_LEGEND.some((e) => e.color === "#dc2626"));
});

// ---------------------------------------------------------------------------
// Schema — AC: conflict_events' UNIQUE KEY never includes a timestamp column
// ---------------------------------------------------------------------------

test("conflict_events's UNIQUE KEY is (source, source_event_id) only — no event_date or any time column", () => {
  const schema = readSrc("lib", "server", "db", "schema.ts");
  const match = schema.match(/conflictEvents:\s*`([\s\S]*?)`,/);
  assert.ok(match, "conflictEvents DDL entry not found in schema.ts");
  const ddl = match[1];

  const uniqueKeyMatch = ddl.match(/UNIQUE KEY\s+uq_conflict_event\s*\(([^)]*)\)/);
  assert.ok(uniqueKeyMatch, "uq_conflict_event not found");

  const keyColumns = uniqueKeyMatch[1].split(",").map((c) => c.trim());
  assert.deepEqual(keyColumns, ["source", "source_event_id"]);

  // Guard against any time/date-ish column sneaking into the key, however
  // it's named — this is exactly the cwa_station_weather bug class (see
  // docs/domains/09-database-data-integrity.md).
  const TIME_OR_DATE_LIKE = /year|month|date|time|episode|seen|at$/i;
  for (const column of keyColumns) {
    assert.ok(!TIME_OR_DATE_LIKE.test(column), `UNIQUE KEY column "${column}" looks time/date-related`);
  }

  // event_date must exist as a plain column (not part of any key).
  assert.match(ddl, /event_date DATE NOT NULL/);
  assert.doesNotMatch(ddl, /UNIQUE KEY[^)]*event_date/);
});

test("conflict_events is registered in runSchemaMigrations (new table gets created)", () => {
  const mysql = readSrc("lib", "server", "db", "mysql.ts");
  assert.match(mysql, /TABLE_DDL\.conflictEvents/);
});

// ---------------------------------------------------------------------------
// Query layer — source-text checks (DB-import-free constraint, see this
// file's own top-of-file comment)
// ---------------------------------------------------------------------------

test("upsertConflictEvents is an INSERT ... ON DUPLICATE KEY UPDATE, not a DELETE+INSERT", () => {
  const src = readSrc("lib", "server", "conflicts", "queries.ts");
  assert.match(src, /INSERT INTO conflict_events/);
  assert.match(src, /ON DUPLICATE KEY UPDATE/);
  const upsertBody = src.slice(0, src.indexOf("cleanupOldConflictEvents"));
  assert.ok(!/DELETE FROM conflict_events/.test(upsertBody), "the upsert path itself must not delete rows");
});

test("cleanupOldConflictEvents only deletes GDELT-sourced rows older than the retention window, scoped by source", () => {
  const src = readSrc("lib", "server", "conflicts", "queries.ts");
  assert.match(
    src,
    /DELETE FROM conflict_events WHERE source = 'gdelt' AND event_date < DATE_SUB\(UTC_DATE\(\), INTERVAL \? DAY\)/,
  );
});

test("getCurrentGdeltConflictEvents is read-only, filters to source='gdelt', and degrades to an empty array on a DB error", () => {
  const src = readSrc("lib", "server", "conflicts", "queries.ts");
  assert.match(src, /export const getCurrentGdeltConflictEvents/);
  const fnBody = src.slice(src.indexOf("export const getCurrentGdeltConflictEvents"));
  assert.match(fnBody, /source = 'gdelt'/);
  assert.ok(
    !/INSERT INTO conflict_events|UPDATE conflict_events|DELETE FROM conflict_events/.test(fnBody),
    "getCurrentGdeltConflictEvents must be read-only",
  );
  assert.match(fnBody, /withConnectionFallback\(\s*\[\]/);
});

// ---------------------------------------------------------------------------
// Sync pipeline — source-text checks
// ---------------------------------------------------------------------------

test("runConflictsGdeltSync acquires a MySQL advisory lock before writing and never deletes/truncates the table itself", () => {
  const src = readSrc("lib", "server", "conflicts", "runSync.ts");
  assert.match(src, /withAdvisoryLock\(/);
  assert.match(src, /conflicts_gdelt_sync_lock/);
  const syncFnBody = src.slice(0, src.indexOf("export async function runConflictsGdeltCleanup"));
  assert.ok(
    !/DELETE FROM conflict_events|TRUNCATE TABLE conflict_events/i.test(syncFnBody),
    "runConflictsGdeltSync must not delete/truncate conflict_events",
  );
});

test("runConflictsGdeltSync writes failures to the shared ingest_errors mechanism instead of throwing out of the function (AC: GDELT 逾時或無法連線時排程只記警告、不讓 health-web 崩潰)", () => {
  const src = readSrc("lib", "server", "conflicts", "runSync.ts");
  assert.match(src, /writeIngestionError\(/);
  assert.match(src, /catch \(error\)/);
});

test("the GDELT conflicts pipeline requires no API token/key anywhere (GDELT needs none) — no env var gate exists to accidentally no-op on", () => {
  for (const file of [
    ["lib", "server", "gdelt", "sources", "gdelt.ts"],
    ["lib", "server", "conflicts", "runSync.ts"],
  ]) {
    const src = readSrc(...file);
    assert.ok(!/process\.env\.\w*GDELT\w*TOKEN/i.test(src), `${file.join("/")} should not gate on a GDELT token`);
  }
});

test("runConflictsGdeltCleanup never throws (its own try/catch), matching every other *Cleanup job's contract", () => {
  const src = readSrc("lib", "server", "conflicts", "runSync.ts");
  const fnBody = src.slice(src.indexOf("export async function runConflictsGdeltCleanup"));
  assert.match(fnBody, /try\s*{/);
  assert.match(fnBody, /catch \(error\)/);
});

// ---------------------------------------------------------------------------
// Cron registration + admin manual-trigger route
// ---------------------------------------------------------------------------

test("registerJobs.ts registers both the GDELT conflicts sync and its daily cleanup", () => {
  const src = readSrc("lib", "server", "cron", "registerJobs.ts");
  assert.match(src, /runConflictsGdeltSync/);
  assert.match(src, /runConflictsGdeltCleanup/);
  assert.match(src, /conflicts-gdelt-sync-cron\.log/);
  assert.match(src, /conflicts-gdelt-cleanup-cron\.log/);
});

test("POST /api/admin/conflicts-gdelt-sync requires the admin secret and calls runConflictsGdeltSync by default", () => {
  const src = readSrc("app", "api", "admin", "conflicts-gdelt-sync", "route.ts");
  assert.match(src, /requireAdminSecret\(request\)/);
  assert.match(src, /runConflictsGdeltSync\(\)/);
  assert.match(src, /runConflictsGdeltCleanup\(\)/);
});

// ---------------------------------------------------------------------------
// Pages / components — source-text + structural assertions, same convention
// as tests/global-watch-593-typhoons.test.mjs
// ---------------------------------------------------------------------------

const zhPageSrc = readSrc("app", "(zh)", "tools", "global-watch", "conflicts", "page.tsx");
const localePageSrc = readSrc("app", "[locale]", "tools", "global-watch", "conflicts", "page.tsx");
const itemSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchConflictsItem.tsx");
const clientSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchConflictsClient.tsx");
const globeSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchConflictsGlobe.tsx");

test("the zh conflicts page has its own metadata (title/description/keywords/canonical/hreflang), independent of the root shell", () => {
  assert.match(zhPageSrc, /title:\s*TITLE/);
  assert.match(zhPageSrc, /description:\s*DESCRIPTION/);
  assert.match(zhPageSrc, /keywords:\s*\[[^\]]*"武裝衝突"/);
  assert.match(zhPageSrc, /canonical,\s*languages:\s*buildHreflangAlternates\(CANONICAL_PATH, baseUrl\)/);
  assert.match(zhPageSrc, /CANONICAL_PATH\s*=\s*"\/tools\/global-watch\/conflicts"/);
});

test("both conflicts pages fetch getCurrentGdeltConflictEvents and transform via buildConflictsGlobeData", () => {
  for (const src of [zhPageSrc, localePageSrc]) {
    assert.match(src, /getCurrentGdeltConflictEvents\(\)/);
    assert.match(src, /buildConflictsGlobeData\(/);
  }
});

test("the locale conflicts page follows the typhoons locale-page pattern: generateStaticParams over PATH_LOCALES, notFound() guard, and hreflang alternates", () => {
  assert.match(localePageSrc, /export function generateStaticParams\(\)/);
  assert.match(localePageSrc, /PATH_LOCALES\.map/);
  assert.match(localePageSrc, /if \(!isPathLocale\(locale\)\) notFound\(\);/);
  assert.match(localePageSrc, /buildHreflangAlternates\(CANONICAL_PATH, baseUrl\)/);
  assert.match(localePageSrc, /CANONICAL_PATH = "\/tools\/global-watch\/conflicts"/);
  assert.match(localePageSrc, /getLocalizedPageMeta\("globalWatchConflicts", locale\)/);
});

test("getLocalizedPageMeta('globalWatchConflicts', locale) returns complete, non-empty, genuinely-translated en/ja/ko content", async () => {
  const { getLocalizedPageMeta } = await import("../lib/i18n/pageContent.ts");
  for (const locale of ["en", "ja", "ko"]) {
    const meta = getLocalizedPageMeta("globalWatchConflicts", locale);
    assert.ok(meta.title?.trim(), `${locale}: title must not be empty`);
    assert.ok(meta.description?.trim(), `${locale}: description must not be empty`);
  }
  const enMeta = getLocalizedPageMeta("globalWatchConflicts", "en");
  assert.ok(!/[一-鿿]/.test(enMeta.title), "en: title should not contain untranslated Chinese");
  assert.ok(!/[一-鿿]/.test(enMeta.description), "en: description should not contain untranslated Chinese");
});

test("GlobeWatchConflictsItem renders the shared item-switcher tabs, the globe client, legend, and the required GDELT citation + link", () => {
  assert.match(itemSrc, /<GlobeWatchItemTabs\s*\/>/);
  assert.match(itemSrc, /<GlobeWatchConflictsClient data=\{data\}\s*\/>/);
  assert.match(itemSrc, /<GlobeWatchConflictsLegend legend=\{CONFLICT_LEGEND\}\s*\/>/);
  assert.match(itemSrc, /gdeltproject\.org/);
  assert.match(itemSrc, /GDELT_PROJECT_URL = "https:\/\/www\.gdeltproject\.org\/"/);
});

test("GlobeWatchConflictsItem's disclaimer states this is relayed data, not the site's own political judgment (AC: 本站不代表政治判斷，資料轉載自列名來源)", () => {
  assert.match(itemSrc, /不代表本站對任何衝突、政治立場或各方責任之判定/);
});

test("GlobeWatchConflictsItem renders the explicit empty-state message when data.emptyState is true, and the list otherwise", () => {
  assert.match(itemSrc, /data\.emptyState\s*\?/);
  assert.match(itemSrc, /globe-watch-conflicts-empty-state/);
});

test("GlobeWatchConflictsClient loads the globe via next/dynamic with ssr:false, gated behind the WebGL probe, and never mounts the globe when emptyState is true", () => {
  assert.match(clientSrc, /dynamic\(\s*\(\)\s*=>\s*import\("\.\/GlobeWatchConflictsGlobe"\)/);
  assert.match(clientSrc, /ssr:\s*false/);
  assert.match(clientSrc, /webglSupported\s*===\s*true\s*&&\s*!data\.emptyState/);
  assert.match(clientSrc, /webglSupported\s*===\s*true\s*&&\s*data\.emptyState/);
  assert.match(clientSrc, /variant="empty"/);
});

test("GlobeWatchConflictsGlobe uses MapLibre's globe projection and paints marker color straight from the feature property (no business logic in the globe component)", () => {
  assert.match(globeSrc, /setProjection\(\{\s*type:\s*"globe"\s*\}\)/);
  assert.match(globeSrc, /"circle-color":\s*\["get",\s*"markerColor"\]/);
});

// ---------------------------------------------------------------------------
// translatedPages.ts wiring
// ---------------------------------------------------------------------------

test("/tools/global-watch/conflicts is a registered translated path with full en/ja/ko/x-default hreflang", async () => {
  const { isTranslatedPath, buildLocalizedPath, buildHreflangAlternates, TRANSLATED_STANDALONE_PATHS, I18N_SCOPE_PAGES, scopeEntryPath } =
    await import("../lib/i18n/translatedPages.ts");

  const pathStr = "/tools/global-watch/conflicts";
  assert.ok(TRANSLATED_STANDALONE_PATHS.map(scopeEntryPath).includes(pathStr));
  assert.ok(I18N_SCOPE_PAGES.map(scopeEntryPath).includes(pathStr));
  assert.ok(isTranslatedPath(pathStr));
  assert.equal(buildLocalizedPath(pathStr, "en"), "/en/tools/global-watch/conflicts");
  assert.equal(buildLocalizedPath(pathStr, "ja"), "/ja/tools/global-watch/conflicts");
  assert.equal(buildLocalizedPath(pathStr, "ko"), "/ko/tools/global-watch/conflicts");

  const baseUrl = "https://health.j172.tw";
  const alternates = buildHreflangAlternates(pathStr, baseUrl);
  assert.ok(alternates);
  assert.equal(alternates["zh-TW"], `${baseUrl}/tools/global-watch/conflicts`);
  assert.equal(alternates.en, `${baseUrl}/en/tools/global-watch/conflicts`);
  assert.equal(alternates["x-default"], `${baseUrl}/tools/global-watch/conflicts`);
});

test("app/[locale]/tools/global-watch/conflicts/page.tsx exists (the i18n-routing-485 guardrail test enumerates TRANSLATED_STANDALONE_PATHS generically, so this just double-checks the file is really there)", () => {
  assert.ok(existsSync(path.join(ROOT_DIR, "app", "[locale]", "tools", "global-watch", "conflicts", "page.tsx")));
});

// ---------------------------------------------------------------------------
// GLOBE_WATCH_ITEMS registry
// ---------------------------------------------------------------------------

test("the conflicts item is registered in the shared GLOBE_WATCH_ITEMS registry with a full per-locale label, alongside every other item already there", async () => {
  const { GLOBE_WATCH_ITEMS } = await import("../lib/tools/globeWatch/items.ts");
  const conflicts = GLOBE_WATCH_ITEMS.find((item) => item.key === "conflicts");
  assert.ok(conflicts, "expected a conflicts entry in GLOBE_WATCH_ITEMS");
  assert.equal(conflicts.path, "/tools/global-watch/conflicts");
  for (const locale of ["zh-TW", "en", "ja", "ko"]) {
    const text = conflicts.label?.[locale];
    assert.ok(typeof text === "string" && text.trim().length > 0, `conflicts.label.${locale} must be non-empty`);
  }
  // Every item that existed before this ticket must still be present, unremoved.
  for (const key of ["earthquakes", "epidemics", "disasters", "air-quality", "typhoons"]) {
    assert.ok(GLOBE_WATCH_ITEMS.some((item) => item.key === key), `${key} entry must still exist`);
  }
});
