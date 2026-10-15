import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// issue #678 (Track B B-8) wiring: the 資料日期 / 「資料暫缺」 states themselves
// are unit-tested in lib/format/facilityDataStatus.test.mjs. This file checks
// that the pieces are actually connected — the server query, the
// /api/facilities opt-in parameter, the two tool configs and the client
// component — without a DOM (this repo has no component-render harness; JSX
// files are checked as raw text, see tests/social-welfare-centers-603.test.mjs).

const REPO_ROOT = new URL("../", import.meta.url);
const ROOT_DIR = fileURLToPath(REPO_ROOT);

// A fake DB connection the server module's `withConnection` hands to its callback.
const fakeDb = { calls: [], rows: [{ total: 0, last_synced_at: null }], fail: false };
globalThis.__facilityDataStatusFakeDb = fakeDb;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    if (specifier === "@/lib/server/db/mysql") {
      const stub =
        "export const withConnection = async (fn) => { const db = globalThis.__facilityDataStatusFakeDb;" +
        " if (db.fail) throw new Error('db down');" +
        " return fn({ query: async (sql, params) => { db.calls.push({ sql, params }); return [db.rows]; } }); };";
      return { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true };
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
});

const read = (rel) => fs.readFileSync(path.join(ROOT_DIR, rel), "utf-8");

const { getFacilitySourceDataStatus } = await import("../lib/server/facilities/dataStatus.ts");
const { facilitySearchConfigs } = await import("../app/(zh)/tools/facilityConfigs.ts");

// --- server query -----------------------------------------------------------

test("getFacilitySourceDataStatus: one parameterised COUNT/MAX query scoped to (facility_type, source_key)", async () => {
  fakeDb.calls.length = 0;
  fakeDb.fail = false;
  fakeDb.rows = [{ total: 241, last_synced_at: new Date("2026-10-15T17:30:00.000Z") }];
  const status = await getFacilitySourceDataStatus("postpartum_care", "nhplatform_115950_postpartum");
  assert.deepEqual(status, { sourceTotal: 241, dataDate: "2026-10-16" });
  assert.equal(fakeDb.calls.length, 1);
  const { sql, params } = fakeDb.calls[0];
  assert.match(sql, /SELECT COUNT\(\*\) AS total, MAX\(synced_at\) AS last_synced_at\s+FROM facilities/);
  assert.match(sql, /WHERE facility_type = \? AND source_key = \?/);
  assert.deepEqual(params, ["postpartum_care", "nhplatform_115950_postpartum"]);
  assert.ok(!sql.includes("nhplatform"), "values are bound, never interpolated into the SQL text");
});

test("getFacilitySourceDataStatus: an empty source is zero rows with no date (the 資料暫缺 trigger)", async () => {
  fakeDb.calls.length = 0;
  fakeDb.rows = [{ total: 0, last_synced_at: null }];
  assert.deepEqual(await getFacilitySourceDataStatus("long_term_care", "nhplatform_115950_ltc"), {
    sourceTotal: 0,
    dataDate: null,
  });
});

test("getFacilitySourceDataStatus: a DB failure rejects instead of being reported as zero rows", async () => {
  fakeDb.fail = true;
  await assert.rejects(getFacilitySourceDataStatus("long_term_care", "nhplatform_115950_ltc"), /db down/);
  fakeDb.fail = false;
});

// --- API route ----------------------------------------------------------------

const routeSrc = read("app/api/facilities/route.ts");

test("/api/facilities: dataStatusSource is opt-in, validated, and only adds a field to the response", () => {
  assert.match(routeSrc, /parseDataStatusSourceParam\(params\.get\("dataStatusSource"\)\)/);
  assert.match(routeSrc, /getFacilitySourceDataStatus\(facilityType, dataStatusSource\)/);
  // A failed status query must degrade to "unknown" (field omitted), never 500 the whole list and never read as zero rows.
  assert.match(routeSrc, /getFacilitySourceDataStatus\(facilityType, dataStatusSource\)\.catch\(\(\) => null\)/);
  assert.match(routeSrc, /dataStatus \? \{ dataStatus \} : \{\}/);
});

test("/api/facilities: both DB-backed response branches (non-empty and empty table) carry dataStatus; Cache-Control is unchanged", () => {
  const occurrences = routeSrc.match(/\.\.\.\(dataStatus \? \{ dataStatus \} : \{\}\)/g) ?? [];
  assert.equal(occurrences.length, 2);
  assert.match(routeSrc, /const FACILITIES_CACHE_HEADERS = \{ "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" \}/);
});

// --- tool configs ------------------------------------------------------------------

test("postpartum-care config reports on the whole postpartum source and links the official dataset", () => {
  const cfg = facilitySearchConfigs["postpartum-care"].dataStatus;
  assert.ok(cfg, "postpartum-care must carry a dataStatus config");
  assert.equal(cfg.sourceKey, "nhplatform_115950_postpartum");
  assert.equal(cfg.subject, "產後護理之家");
  assert.equal(cfg.onlyForCategories, undefined);
  assert.equal(cfg.sourceUrl, "https://data.gov.tw/dataset/115950");
});

test("long-term-care config reports only for the two nursing-institution categories, which exist in its dropdown", () => {
  const ltc = facilitySearchConfigs["long-term-care"];
  const cfg = ltc.dataStatus;
  assert.ok(cfg, "long-term-care must carry a dataStatus config");
  assert.equal(cfg.sourceKey, "nhplatform_115950_ltc");
  assert.deepEqual([...cfg.onlyForCategories].sort(), ["一般護理之家", "居家護理所"]);
  const dropdownValues = ltc.categories.map((c) => c.value);
  for (const category of cfg.onlyForCategories) {
    assert.ok(dropdownValues.includes(category), `${category} must be a real category option`);
  }
  assert.ok(cfg.partialNote, "other sources (LTC GIS) still list some 護理之家, so the missing notice must say the list is partial");
});

test("both configs use source keys the shared parser really writes", async () => {
  const { mapRowToFacilityRecord } = await import("../lib/server/facilities/sources/nhplatformNursingInstitutions.ts");
  const base = {
    機構代碼: "1", 機構名稱: "x", 地址: "y", 機構電話: "", 評鑑結果: "", 合格效期: "", WGS84經度: "121", WGS84緯度: "25",
    "一般護理之家-開放床數": "", "產後護理床-開放床數": "", "護理類-嬰兒床-開放床數": "",
  };
  assert.equal(mapRowToFacilityRecord({ ...base, 機構類別: "產後護理之家" }).sourceKey, facilitySearchConfigs["postpartum-care"].dataStatus.sourceKey);
  assert.equal(mapRowToFacilityRecord({ ...base, 機構類別: "居家護理所" }).sourceKey, facilitySearchConfigs["long-term-care"].dataStatus.sourceKey);
});

test("no other facility tool opts in (the notice is scoped to the manually imported source)", () => {
  const optedIn = Object.entries(facilitySearchConfigs)
    .filter(([, cfg]) => cfg.dataStatus)
    .map(([slug]) => slug)
    .sort();
  assert.deepEqual(optedIn, ["long-term-care", "postpartum-care"]);
});

// --- client component (JSX: raw-text checks) ------------------------------------------

const componentSrc = read("components/Facilities/FacilitySearchContent.tsx");
const noticeSrc = read("components/Facilities/FacilityDataStatusNotice.tsx");

test("FacilitySearchContent requests the per-source status only when the config opts in and the category applies", () => {
  assert.match(componentSrc, /from "@\/lib\/format\/facilityDataStatus"/);
  assert.match(componentSrc, /isDataStatusActive\(dataStatus, category\)/);
  assert.match(componentSrc, /params\.set\("dataStatusSource", dataStatus\.sourceKey\)/);
  assert.match(componentSrc, /setSourceStatus\(/);
});

test("FacilitySearchContent swaps the generic empty-state for the 資料暫缺 notice when the source has zero rows", () => {
  assert.match(componentSrc, /isFacilityDataMissing\(dataStatus, sourceStatus, category\)/);
  assert.match(componentSrc, /<FacilityDataStatusNotice/);
  // The misleading "附近查無收錄…" copy must be suppressed while the source is known to be empty.
  assert.match(componentSrc, /const hideGenericEmptyState = dataMissing &&/);
  assert.match(componentSrc, /hideGenericEmptyState \? null : \(/);
});

test("FacilityDataStatusNotice renders both states from the pure builder, with the heading, date and source link", () => {
  assert.match(noticeSrc, /buildDataStatusNotice\(/);
  assert.match(noticeSrc, /notice\.state === "missing"/);
  assert.match(noticeSrc, /notice\.heading/);
  assert.match(noticeSrc, /notice\.dataDateLabel/);
  assert.match(noticeSrc, /role="status"/);
  assert.match(noticeSrc, /rel="noopener noreferrer"/);
});
