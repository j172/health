import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

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
        if (existsSyncSafe(candidate)) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

function existsSyncSafe(url) {
  try {
    return fs.existsSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

// issue #603 — /tools/social-welfare-centers ("社福中心與社工求助").
//
// The page's client component (components/Tools/SocialWelfareCentersContent.tsx)
// contains real JSX, which Node's native TS-stripping loader cannot parse
// (strip-only — it erases types, it doesn't transform JSX), and this repo has
// no React-rendering/DOM test harness (no jsdom, @testing-library/react — the
// package.json `test` script only globs lib/**, scripts/**, tests/**, and no
// components/**/*.test.mjs exists anywhere in the repo) to mount it in
// anyway. So that file is read as raw text for the static checks below —
// same convention already used for other JSX files' behavior in this
// `tests/` directory (see tests/tools-category-pages-459.test.mjs,
// tests/home-rebuild-472.test.mjs) — and all of the actually-testable
// logic/content lives in the sibling, JSX-free
// components/Tools/socialWelfareCentersShared.ts module, imported normally.
const SOURCE_PATH = path.join(fileURLToPath(REPO_ROOT), "components/Tools/SocialWelfareCentersContent.tsx");
const SOURCE_TEXT = fs.readFileSync(SOURCE_PATH, "utf-8");

const {
  SITUATIONS,
  SOCIAL_WORKER_VISIT_STEPS,
  QUICK_EXIT_URL,
  filterSocialWelfareCenters,
  resolveNearestCounty,
} = await import("../components/Tools/socialWelfareCentersShared.ts");

// --- Privacy: no browser storage / cookies anywhere in this component ---
//
// This is the test issue #603's acceptance criterion ("頁面不使用
// localStorage／sessionStorage／cookie 記錄使用者選過的情境或查詢內容") asks
// for. A static source-text check is the established alternative already
// used for this exact kind of guarantee elsewhere in this codebase's spec
// ("可用 spy 或原始碼文字檢查雙重把關", the Testing Decisions for
// matchChildSubsidies in docs/2.0/child-family-welfare-plan.md) — and it is
// actually a *stronger* guarantee than a click-spy would be here: it covers
// every code path in this file, not just the interactions a test happens to
// simulate. Checked against both files that make up this page's client-side
// behavior.
test("neither SocialWelfareCentersContent.tsx nor socialWelfareCentersShared.ts ever calls localStorage/sessionStorage, or reads/writes document.cookie", () => {
  const sharedPath = path.join(fileURLToPath(REPO_ROOT), "components/Tools/socialWelfareCentersShared.ts");
  const sharedText = fs.readFileSync(sharedPath, "utf-8");
  for (const [label, text] of [
    ["SocialWelfareCentersContent.tsx", SOURCE_TEXT],
    ["socialWelfareCentersShared.ts", sharedText],
  ]) {
    assert.doesNotMatch(text, /localStorage\s*[.([]/i, `${label} must not call any localStorage method`);
    assert.doesNotMatch(text, /sessionStorage\s*[.([]/i, `${label} must not call any sessionStorage method`);
    assert.doesNotMatch(text, /document\.cookie/i, `${label} must not read or write document.cookie`);
  }
});

test("the quick-exit button uses location.replace (so the browser Back button can't return here), not location.href or router.push", () => {
  assert.match(SOURCE_TEXT, /window\.location\.replace\(QUICK_EXIT_URL\)/);
  assert.doesNotMatch(SOURCE_TEXT, /location\.href\s*=/);
});

test("a global keydown listener for Escape is registered and cleaned up on unmount", () => {
  assert.match(SOURCE_TEXT, /addEventListener\(\s*["']keydown["']/);
  assert.match(SOURCE_TEXT, /removeEventListener\(\s*["']keydown["']/);
  assert.match(SOURCE_TEXT, /event\.key\s*===\s*["']Escape["']/);
});

test("QUICK_EXIT_URL points somewhere unrelated to this page's own topic", () => {
  assert.ok(QUICK_EXIT_URL.startsWith("https://"));
  assert.ok(!QUICK_EXIT_URL.includes("mohw") && !QUICK_EXIT_URL.includes("sfaa"));
});

test("ToolPageShell is told to skip the device-wide 最近使用的工具 localStorage recorder on this page", () => {
  const pagePath = path.join(fileURLToPath(REPO_ROOT), "app/(zh)/tools/social-welfare-centers/page.tsx");
  const pageText = fs.readFileSync(pagePath, "utf-8");
  assert.match(pageText, /skipRecentToolTracking/);
});

// --- Situational guide content ---

test("every situation has a non-empty description, at least one step, and an official source URL", () => {
  assert.ok(SITUATIONS.length >= 5, "issue #603 requires all 5 scenarios: 經濟困難/照顧壓力/懷疑家暴兒虐/獨居長輩/未成年懷孕");
  for (const situation of SITUATIONS) {
    assert.ok(situation.description.length > 0, `${situation.id} needs a description`);
    assert.ok(situation.steps.length > 0, `${situation.id} needs at least one suggested step`);
    assert.ok(situation.officialSource.url.startsWith("https://"), `${situation.id} needs an official source URL`);
  }
});

test("covers the 5 required scenarios from issue #603's acceptance criteria", () => {
  const titles = SITUATIONS.map((s) => s.title);
  for (const required of ["經濟困難", "照顧壓力", "懷疑家暴兒虐", "獨居長輩", "未成年懷孕"]) {
    assert.ok(titles.includes(required), `missing required scenario: ${required}`);
  }
});

test("exactly the domestic-violence/child-abuse scenario shows the extra browsing-history privacy warning", () => {
  const abuseRelated = SITUATIONS.filter((s) => s.isAbuseRelated);
  assert.equal(abuseRelated.length, 1);
  assert.equal(abuseRelated[0].title, "懷疑家暴兒虐");
});

test("社工來訪會做什麼 explainer has at least 2 ordered steps", () => {
  assert.ok(SOCIAL_WORKER_VISIT_STEPS.length >= 2);
  const orders = SOCIAL_WORKER_VISIT_STEPS.map((s) => s.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
});

// --- Facility finder (pure functions) ---

const SAMPLE_CENTERS = [
  { name: "士林社會福利服務中心", address: "臺北市士林區基河路140號1樓", phone: "02-2835-0247", serviceArea: "士林區" },
  { name: "板橋第二社會福利服務中心", address: "新北市板橋區漢生東路258號3樓", phone: "02-2953-7301", serviceArea: null },
  { name: "泰五林社會福利服務中心", address: "新北市新莊區福營路277號4樓", phone: "02-2906-7980", serviceArea: "泰山區、林口區、五股區" },
];

test("filterSocialWelfareCenters: empty county/keyword returns every center unchanged", () => {
  assert.deepEqual(filterSocialWelfareCenters(SAMPLE_CENTERS), SAMPLE_CENTERS);
});

test("filterSocialWelfareCenters: filters by county, tolerant of the 臺/台 spelling difference", () => {
  const result = filterSocialWelfareCenters(SAMPLE_CENTERS, { county: "臺北市" });
  assert.deepEqual(result.map((c) => c.name), ["士林社會福利服務中心"]);

  const informal = filterSocialWelfareCenters(SAMPLE_CENTERS, { county: "台北市" });
  assert.deepEqual(informal.map((c) => c.name), ["士林社會福利服務中心"]);
});

test("filterSocialWelfareCenters: county filter with 2 matches returns both", () => {
  const result = filterSocialWelfareCenters(SAMPLE_CENTERS, { county: "新北市" });
  assert.deepEqual(result.map((c) => c.name).sort(), ["板橋第二社會福利服務中心", "泰五林社會福利服務中心"].sort());
});

test("filterSocialWelfareCenters: keyword matches against serviceArea even when address doesn't contain it (coverage area, not office location)", () => {
  // 泰五林社會福利服務中心's own office sits in 新莊區, but its 服務轄區 covers
  // 泰山區／林口區／五股區 — someone living in a district the office doesn't
  // sit in but still covers is exactly what this filter exists for.
  const result = filterSocialWelfareCenters(SAMPLE_CENTERS, { county: "新北市", keyword: "林口區" });
  assert.deepEqual(result.map((c) => c.name), ["泰五林社會福利服務中心"]);
});

test("filterSocialWelfareCenters: a center with no serviceArea isn't dropped by an empty keyword", () => {
  const result = filterSocialWelfareCenters(SAMPLE_CENTERS, { county: "新北市", keyword: "" });
  assert.equal(result.length, 2);
});

test("filterSocialWelfareCenters: a center with no address is excluded once a county filter is set", () => {
  const centers = [{ name: "缺地址中心", address: null, phone: null, serviceArea: null }];
  assert.deepEqual(filterSocialWelfareCenters(centers, { county: "臺北市" }), []);
});

test("resolveNearestCounty: resolves a coordinate near Taipei City Hall to 臺北市", () => {
  assert.equal(resolveNearestCounty(25.033, 121.5654), "臺北市");
});

test("resolveNearestCounty: resolves a coordinate near Kaohsiung to 高雄市", () => {
  assert.equal(resolveNearestCounty(22.6273, 120.3014), "高雄市");
});
