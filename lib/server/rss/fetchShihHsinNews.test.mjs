import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
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

const { parseShihHsinHtml } = await import("./fetchShihHsinNews.ts");
const { getSourceLabel, hasSourceLabel } = await import("../news/sourceLabels.ts");
const { SOURCE_CATEGORIES } = await import("../news/sourceCategories.ts");

test("Shih-Hsin: source label and media category registration", () => {
  assert.equal(getSourceLabel("shih_hsin"), "世新大學");
  assert.equal(hasSourceLabel("shih_hsin"), true);
  const mediaCat = SOURCE_CATEGORIES.find((c) => c.key === "media");
  assert.ok(mediaCat);
  assert.ok(mediaCat.sources.some((s) => s.sourceName === "shih_hsin"));
});

test("parseShihHsinHtml extracts spotlight items correctly", () => {
  const sampleHtml = `
    <div class="ctabox-aa-box">
      <img src="https://www.shu.edu.tw/BBS/Ann_Spotlight/32793/202609151.jpg" alt="世新大學整合校園新空間　圖書館改造與新雕塑受關注" />
      <p class="qsty-b"><a href="Spotlight.aspx?from=06&sID=32793">世新大學整合校園新空間　圖書館改造與新雕塑受關注</a></p>
      <div class="read-more"><a href="Spotlight.aspx?from=06&sID=32793">閱讀更多</a></div>
    </div>
    <div class="ctabox-aa-box">
      <img src="/BBS/Ann_Spotlight/32786/20260911.jpg" alt="香蕉哥哥歡迎學弟妹入學" />
      <p class="qsty-b"><a href="Spotlight.aspx?from=06&sID=32786">香蕉哥哥歡迎學弟妹入學</a></p>
      <div class="read-more"><a href="Spotlight.aspx?from=06&sID=32786">閱讀更多</a></div>
    </div>
  `;

  const items = parseShihHsinHtml(sampleHtml);
  assert.equal(items.length, 2);

  assert.equal(items[0].sId, "32793");
  assert.equal(items[0].title, "世新大學整合校園新空間　圖書館改造與新雕塑受關注");
  assert.equal(items[0].url, "https://www.shu.edu.tw/Spotlight.aspx?from=06&sID=32793");
  assert.equal(items[0].imageUrl, "https://www.shu.edu.tw/BBS/Ann_Spotlight/32793/202609151.jpg");
  assert.ok(items[0].publishedAtUtc instanceof Date);
  assert.equal(items[0].publishedAtUtc.toISOString(), "2026-09-14T16:00:00.000Z");

  assert.equal(items[1].sId, "32786");
  assert.equal(items[1].imageUrl, "https://www.shu.edu.tw/BBS/Ann_Spotlight/32786/20260911.jpg");
  assert.equal(items[1].publishedAtUtc.toISOString(), "2026-09-10T16:00:00.000Z");
});

test("parseShihHsinHtml handles empty or malformed HTML gracefully", () => {
  const items = parseShihHsinHtml("<div><p>無文章</p></div>");
  assert.equal(items.length, 0);
});
