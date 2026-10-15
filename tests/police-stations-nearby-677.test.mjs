import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

// Issue #677 (B-9): 派出所 (dataset 5958) in "/nearby" as a new "更多類型" type, interlinked with
// child-safety-spots, shown with its data date, and registered as a manual (residential-network)
// import in the six-monthly list. The parser/converter/script have their own tests
// (lib/server/facilities/sources/policeStations5958.test.mjs, scripts/import-police-stations-5958.test.mjs);
// this file covers the wiring around them. DB-backed and JSX files are checked by source text, the
// repo's convention (see tests/nearby-page-466.test.mjs).

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = new URL("../", import.meta.url);
const read = (...segments) => fs.readFileSync(path.join(ROOT_DIR, ...segments), "utf8");

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
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
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
      return { format: "json", source: fs.readFileSync(fileURLToPath(url), "utf8"), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const registry = await import("../lib/server/nearby/registry.ts");
const { buildFacilityNearbyExtra } = await import("../lib/server/nearby/aggregate.ts");
const { getLocalizedNearbyLabel } = await import("../lib/i18n/nearbyLabelContent.ts");
const { buildNearbyLlmsPageContent } = await import("../lib/server/content/nearbyContent.ts");
const { buildLlmsMarkdown } = await import("../lib/server/content/llmsPage.ts");
const { shouldResetCoordinates } = await import("../lib/server/facilities/addressRules.mjs");

// ---------------------------------------------------------------------------
// 1. Registry
// ---------------------------------------------------------------------------

test("registry: police-stations is a facility type backed by facility_type police_station", () => {
  const def = registry.NEARBY_POLICE_STATION_TYPE;
  assert.equal(def.key, "police-stations");
  assert.equal(def.kind, "facility");
  assert.equal(def.facilityType, "police_station");
  assert.ok(def.label.includes("派出所"));
  assert.ok(def.emoji);
  assert.match(def.description, /警政署/);
  assert.match(def.description, /110/, "points people to 110 for emergencies");
});

test('registry: it is an "更多類型" entry (the 8 defaults stay exactly 8) and findNearbyTypeDef resolves it', () => {
  assert.equal(registry.NEARBY_DEFAULT_TYPES.length, 8);
  assert.ok(!registry.NEARBY_DEFAULT_TYPES.some((d) => d.key === "police-stations"));
  assert.ok(registry.NEARBY_MORE_TYPES.some((d) => d.key === "police-stations"));
  assert.equal(registry.findNearbyTypeDef("police-stations")?.facilityType, "police_station");
});

test("registry: no duplicate keys or facility types across defaults + more types after the addition", () => {
  const all = [...registry.NEARBY_DEFAULT_TYPES, ...registry.NEARBY_MORE_TYPES];
  assert.equal(new Set(all.map((d) => d.key)).size, all.length);
  assert.equal(all.filter((d) => d.facilityType === "police_station").length, 1);
});

test("registry: interlinked with child-safety-spots (the type points at that tool page, which exists in facilitySearchConfigs)", async () => {
  assert.equal(registry.NEARBY_POLICE_STATION_TYPE.toolSlug, "child-safety-spots");
  const { facilitySearchConfigs } = await import("../app/(zh)/tools/facilityConfigs.ts");
  assert.ok(facilitySearchConfigs["child-safety-spots"]);
  // No new tool page / config: the issue adds a nearby type, not a tool.
  assert.ok(!("police-stations" in facilitySearchConfigs));
});

test("llms: the nearby llms/markdown output lists the police-station type", () => {
  const markdown = buildLlmsMarkdown(buildNearbyLlmsPageContent("https://health.j172.tw"));
  assert.ok(markdown.includes(registry.NEARBY_POLICE_STATION_TYPE.label));
});

// ---------------------------------------------------------------------------
// 2. Translated label (nearbyLabelContent is expected to cover every registry key)
// ---------------------------------------------------------------------------

test("i18n: police-stations has real en/ja/ko labels, not the zh fallback", () => {
  const fallback = registry.NEARBY_POLICE_STATION_TYPE.label;
  for (const locale of ["en", "ja", "ko"]) {
    const label = getLocalizedNearbyLabel("police-stations", locale, fallback);
    assert.ok(label && label !== fallback, `${locale} label missing`);
  }
  assert.match(getLocalizedNearbyLabel("police-stations", "en", fallback), /police/i);
});

// ---------------------------------------------------------------------------
// 3. Data date plumbing: facility row -> NearbyItem.extra -> card footer
// ---------------------------------------------------------------------------

test("buildFacilityNearbyExtra: passes the data date and source org through, nothing else", () => {
  assert.deepEqual(
    buildFacilityNearbyExtra({ extra_json: { dataAsOf: "2026-09-30", unitType: "派出所", englishName: "X" }, data_org: "內政部警政署" }),
    { dataAsOf: "2026-09-30", dataOrg: "內政部警政署" },
  );
});

test("buildFacilityNearbyExtra: accepts extra_json delivered as a JSON string", () => {
  assert.deepEqual(buildFacilityNearbyExtra({ extra_json: '{"dataAsOf":"2026-09-30"}', data_org: null }), { dataAsOf: "2026-09-30" });
});

test("buildFacilityNearbyExtra: undefined (not an empty object) when the row has no data date", () => {
  assert.equal(buildFacilityNearbyExtra({ extra_json: null, data_org: "內政部警政署" }), undefined);
  assert.equal(buildFacilityNearbyExtra({ extra_json: { unitType: "派出所" }, data_org: null }), undefined);
  assert.equal(buildFacilityNearbyExtra({ extra_json: "not json", data_org: null }), undefined);
  assert.equal(buildFacilityNearbyExtra({ extra_json: { dataAsOf: 20260930 }, data_org: null }), undefined, "non-string date is ignored");
});

test("nearby/queries.ts forwards the data date for facility types", () => {
  const src = read("lib", "server", "nearby", "queries.ts");
  assert.match(src, /buildFacilityNearbyExtra\(row\)/);
});

test("NearbyContent card footer shows 資料日期 and the source, with translated strings", () => {
  const src = read("components", "Nearby", "NearbyContent.tsx");
  assert.match(src, /extra\?\.dataAsOf/);
  assert.match(src, /nearbyPage\.dataAsOfTemplate/);
  assert.match(src, /nearbyPage\.dataSourceTemplate/);
  for (const locale of ["en", "ja", "ko"]) {
    const dict = JSON.parse(read("locales", `${locale}.json`));
    assert.match(dict.nearbyPage.dataAsOfTemplate, /\{date\}/, `${locale}.json nearbyPage.dataAsOfTemplate`);
    assert.match(dict.nearbyPage.dataSourceTemplate, /\{source\}/, `${locale}.json nearbyPage.dataSourceTemplate`);
  }
});

// ---------------------------------------------------------------------------
// 4. Interlink the other way: the child-safety-spots tool page points at the nearby police stations
// ---------------------------------------------------------------------------

test("child-safety-spots page links to /nearby for the closest police stations", () => {
  const src = read("app", "(zh)", "tools", "child-safety-spots", "page.tsx");
  assert.match(src, /href="\/nearby"/);
  assert.match(src, /派出所/);
});

// ---------------------------------------------------------------------------
// 5. Manual-import registration: not automated, coordinates protected, listed
// ---------------------------------------------------------------------------

test("police_station_5958 is NOT a runSync SOURCES entry (www.tgos.tw 403s the host and runners)", () => {
  const src = read("lib", "server", "facilities", "runSync.ts");
  assert.doesNotMatch(src, /key:\s*"police_station_5958"/);
  assert.match(src, /import-police-stations-5958\.mjs/, "runSync's manual-source comment must list the script");
  assert.match(src, /www\.tgos\.tw/);
});

test("official-coordinate whitelist protects the source's TWD97-derived coordinates from the renormalize reset", () => {
  assert.equal(shouldResetCoordinates("police_station_5958", 25.04), false);
  assert.equal(shouldResetCoordinates("police_station_5958", null), true, "rows without coordinates are still geocoded");
});

test("the six-monthly manual list (script header, workflow comment, scheduling doc) names the 5958 import", () => {
  for (const [segments, label] of [
    [["scripts", "run-six-monthly-sync.sh"], "run-six-monthly-sync.sh"],
    [[".github", "workflows", "six-monthly-sync.yml"], "six-monthly-sync.yml"],
    [["docs", "domains", "10-scheduling-sync-ci.md"], "10-scheduling-sync-ci.md"],
  ]) {
    assert.match(read(...segments), /import-police-stations-5958\.mjs/, `${label} must list import-police-stations-5958.mjs`);
  }
});

test("the six-monthly sync does not try to run the 5958 import automatically", () => {
  const workflow = read(".github", "workflows", "six-monthly-sync.yml");
  // Mentioned only inside a comment, never as a `run:` step.
  for (const line of workflow.split("\n")) {
    if (line.includes("import-police-stations-5958.mjs")) {
      assert.match(line.trim(), /^#/, `non-comment reference: ${line}`);
    }
  }
  assert.doesNotMatch(read("scripts", "run-six-monthly-sync.sh"), /^\s*(node|curl)[^\n#]*police/m);
});

test("no new cron / workflow / secret was added for this import", () => {
  const cron = read("lib", "server", "cron", "registerJobs.ts");
  assert.doesNotMatch(cron, /police_station|police-stations|5958/i);
  assert.ok(!fs.existsSync(path.join(ROOT_DIR, ".github", "workflows", "police-stations-sync.yml")));
});
