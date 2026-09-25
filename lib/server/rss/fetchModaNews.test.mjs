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

const { parseModaHtml, FEED_CODE, SOURCE_NAME } = await import("./fetchModaNews.ts");
const { getSourceLabel, hasSourceLabel } = await import("../news/sourceLabels.ts");
const { SOURCE_CATEGORIES, isGovSource } = await import("../news/sourceCategories.ts");
const { resolveDetailTextScoping } = await import("./fetchDetailPage.ts");

test("MODA: source label and gov category registration", () => {
  assert.equal(getSourceLabel("moda"), "數位發展部");
  assert.equal(hasSourceLabel("moda"), true);
  assert.equal(isGovSource("moda"), true);

  const govCat = SOURCE_CATEGORIES.find((c) => c.key === "gov");
  assert.ok(govCat);
  assert.ok(govCat.sources.some((s) => s.sourceName === "moda" && s.label === "數位發展部"));
});

test("MODA: detail page text scoping resolution", () => {
  const scoping = resolveDetailTextScoping("https://moda.gov.tw/press/press-releases/20702");
  assert.deepEqual(scoping, {
    mode: "only",
    selector: "div.article1.cpArticle",
  });
});

test("parseModaHtml extracts press release list items correctly", () => {
  const sampleHtml = `
    <ul class="list4-2 list-group divider mb-5" id="ListTable">
      <li class="list-group-item d-block bg-transparent px-0">
        <a href="/press/press-releases/20702" class="listCon d-flex w-100 justify-content-md-between align-items-top flex-wrap" title="移至數發部訪查屏東通訊建設 實現偏鄉數位平權並提升離島通訊韌性">
          <div class="listDate me-2 pe-1 me-md-0 pe-md-0 ms-md-3 order-1 order-md-3">2026-09-24</div>
          <div class="listUnit ms-md-3 order-2">韌性建設司</div>
          <div class="col-12 col-md mb-0 order-3 order-md-1">
            <b class="title5 fw-normal">
              數發部訪查屏東通訊建設 實現偏鄉數位平權並提升離島通訊韌性
            </b>
          </div>
        </a>
        <div class="listTag2">
          <a href="javascript:;" class="btn tagclick btn-color2" role="button">推動數位政府</a>
        </div>
      </li>
      <li class="list-group-item d-block bg-transparent px-0">
        <a href="https://moda.gov.tw/press/press-releases/20684" class="listCon d-flex w-100 justify-content-md-between align-items-top flex-wrap" title="移至數發部發布《NGO/NPO數據轉型手冊》">
          <div class="listDate me-2 pe-1 me-md-0 pe-md-0 ms-md-3 order-1 order-md-3">2026-09-22</div>
          <div class="listUnit ms-md-3 order-2">資料創新司</div>
          <div class="col-12 col-md mb-0 order-3 order-md-1">
            <b class="title5 fw-normal">
              數發部發布《NGO/NPO數據轉型手冊》 攜手產官民打造AI驅動公共服務
            </b>
          </div>
        </a>
        <div class="listTag2">
          <a href="javascript:;" class="btn tagclick btn-color2" role="button">推動數位政府</a>
          <a href="javascript:;" class="btn tagclick btn-color2" role="button">推動AI產業發展</a>
        </div>
      </li>
    </ul>
  `;

  const items = parseModaHtml(sampleHtml);
  assert.equal(items.length, 2);

  // Item 1
  assert.equal(items[0].sourceName, SOURCE_NAME);
  assert.equal(items[0].feedCode, FEED_CODE);
  assert.equal(items[0].externalId, "20702");
  assert.equal(items[0].canonicalUrl, "https://moda.gov.tw/press/press-releases/20702");
  assert.equal(items[0].title, "數發部訪查屏東通訊建設 實現偏鄉數位平權並提升離島通訊韌性");
  assert.equal(items[0].deptName, "韌性建設司");
  assert.equal(items[0].categoryRaw, "推動數位政府");
  assert.ok(items[0].publishedAtUtc instanceof Date);
  assert.equal(items[0].publishedAtUtc.toISOString(), "2026-09-23T16:00:00.000Z"); // 2026-09-24 Taipei -> UTC
  assert.ok(items[0].payloadHash.length === 64);

  // Item 2
  assert.equal(items[1].externalId, "20684");
  assert.equal(items[1].canonicalUrl, "https://moda.gov.tw/press/press-releases/20684");
  assert.equal(items[1].deptName, "資料創新司");
  assert.equal(items[1].categoryRaw, "推動數位政府, 推動AI產業發展");
  assert.equal(items[1].publishedAtUtc.toISOString(), "2026-09-21T16:00:00.000Z");
});

test("parseModaHtml handles empty or malformed HTML gracefully", () => {
  const items = parseModaHtml("<div><p>沒有任何新聞清單</p></div>");
  assert.equal(items.length, 0);
});
