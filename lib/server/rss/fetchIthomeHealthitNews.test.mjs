import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

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
});

const { parseIthomeHealthitListHtml } = await import("./fetchIthomeHealthitNews.ts");
const { getSourceLabel, hasSourceLabel } = await import("../news/sourceLabels.ts");
const { SOURCE_CATEGORIES, isGovSource } = await import("../news/sourceCategories.ts");
const { SPECIAL_SOURCE_FEED_CODES } = await import("../config/special-source-feed-codes.ts");

const fixturePath = new URL("./__fixtures__/ithome-healthit-list.html", import.meta.url);
const fixtureHtml = readFileSync(fixturePath, "utf-8");

test("ithome: source label and media category registration", () => {
  assert.equal(getSourceLabel("ithome"), "iThome");
  assert.equal(hasSourceLabel("ithome"), true);
  // iThome is a commercial tech-media outlet, not a government body —
  // belongs in "media", not "gov" (contrast antidrug_news, whose publisher
  // *is* a government body curating other outlets' links).
  assert.equal(isGovSource("ithome"), false);

  const mediaCat = SOURCE_CATEGORIES.find((c) => c.key === "media");
  assert.ok(mediaCat);
  assert.ok(mediaCat.sources.some((s) => s.sourceName === "ithome" && s.label === "iThome"));
});

test("ithome_healthit feed_code is registered as a currently-active special source", () => {
  assert.ok(SPECIAL_SOURCE_FEED_CODES.includes("ithome_healthit"));
});

test("parseIthomeHealthitListHtml extracts real sampled list items correctly", () => {
  const items = parseIthomeHealthitListHtml(fixtureHtml, "https://www.ithome.com.tw/healthit");
  assert.equal(items.length, 4);

  const first = items[0];
  assert.equal(first.externalId, "179748");
  assert.equal(
    first.title,
    "【資安週報】1012～1016，美國查封中國永信至誠的網路攻擊基礎設施，7國網路安全與執法機構亦針對其攻擊活動聯合示警",
  );
  assert.equal(first.canonicalUrl, "https://www.ithome.com.tw/news/179748");
  assert.equal(first.categoryRaw, "資安週報 | 資安一周");
  assert.ok(first.summary.startsWith("國慶連假過後"));
  assert.equal(
    first.imgSrc,
    "https://www.ithome.com.tw/sites/default/files/styles/picture_size_small/public/field/image/zi_an_zhou_bao_20261016.png?itok=xZREvpd6",
  );
  // 2026-10-16 00:00 Taipei (+08:00) -> 2026-10-15 16:00 UTC
  assert.equal(first.publishedAtUtc.toISOString(), "2026-10-15T16:00:00.000Z");

  const second = items[1];
  assert.equal(second.externalId, "179599");
  assert.equal(second.categoryRaw, "衛福部 | FHIR");

  // Sidebar "iThome 研討會" widget's structurally-identical .channel-item divs
  // (a different Drupal view, view-views-seminar) must never be mistaken for
  // real article cards.
  for (const item of items) {
    assert.ok(!item.canonicalUrl.includes("webinar.ithome.com.tw"));
  }

  // The last fixture item has no <img> at all — must degrade to imgSrc: null
  // rather than throwing.
  const last = items[items.length - 1];
  assert.equal(last.externalId, "178639");
  assert.equal(last.imgSrc, null);
});

test("parseIthomeHealthitListHtml handles empty/malformed HTML gracefully", () => {
  const items = parseIthomeHealthitListHtml("<div><p>沒有任何新聞清單</p></div>");
  assert.equal(items.length, 0);
});
