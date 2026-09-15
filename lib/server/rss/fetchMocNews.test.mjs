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

const { parseMocDateToUtc, parseMocAssets, parseMocOpenDataJson } = await import("./fetchMocNews.ts");
const { getSourceLabel, hasSourceLabel } = await import("../news/sourceLabels.ts");
const { isGovSource, SOURCE_CATEGORIES } = await import("../news/sourceCategories.ts");

test("MOC: source label and gov category registration", () => {
  assert.equal(getSourceLabel("moc"), "文化部");
  assert.equal(hasSourceLabel("moc"), true);
  assert.equal(isGovSource("moc"), true);

  const govCategory = SOURCE_CATEGORIES.find((c) => c.key === "gov");
  assert.ok(govCategory, "gov category must exist");
  assert.ok(
    govCategory.sources.some((s) => s.sourceName === "moc" && s.label === "文化部"),
    "gov category must include moc"
  );
});

test("MOC: parseMocDateToUtc parses Taipei time to UTC correctly", () => {
  const d1 = parseMocDateToUtc("2026/9/15 下午 06:05:00");
  assert.ok(d1);
  assert.equal(d1.toISOString(), "2026-09-15T10:05:00.000Z");

  const d2 = parseMocDateToUtc("2026/9/15 上午 10:20:00");
  assert.ok(d2);
  assert.equal(d2.toISOString(), "2026-09-15T02:20:00.000Z");

  const d3 = parseMocDateToUtc("2026/9/15 下午 12:30:00");
  assert.ok(d3);
  assert.equal(d3.toISOString(), "2026-09-15T04:30:00.000Z");

  const d4 = parseMocDateToUtc("2026/9/15 上午 12:30:00");
  assert.ok(d4);
  assert.equal(d4.toISOString(), "2026-09-14T16:30:00.000Z");
});

test("MOC: parseMocAssets extracts images and captions", () => {
  const raw =
    "展覽海報(https://file.moc.gov.tw/p1.jpg);貴賓合影(https://file.moc.gov.tw/p2.jpg);";
  const assets = parseMocAssets(raw);
  assert.equal(assets.length, 2);
  assert.equal(assets[0].title, "展覽海報");
  assert.equal(assets[0].url, "https://file.moc.gov.tw/p1.jpg");
  assert.equal(assets[0].sortOrder, 0);
  assert.equal(assets[1].title, "貴賓合影");
  assert.equal(assets[1].url, "https://file.moc.gov.tw/p2.jpg");
  assert.equal(assets[1].sortOrder, 1);
});

test("MOC: parseMocOpenDataJson parses and filters items within freshness window", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  const fixture = [
    {
      title: "「臺北時裝週SS27」即將於10月15日至18日展出",
      Source: "https://www.moc.gov.tw/News_Content.aspx?n=105&s=261796",
      上版日期: "2026/9/15 下午 05:00:00",
      內容: "<p>「臺北時裝週SS27」即將於10月15日至18日在空總國家文化基地展出。</p>",
      相關圖片: "記者會合影(https://file.moc.gov.tw/001.jpg);",
    },
    {
      title: "第29屆臺法文化獎頒獎典禮舉行",
      Source: "https://www.moc.gov.tw/News_Content.aspx?n=105&s=261795",
      上版日期: "2026/9/15 上午 11:00:00",
      內容: "<p>第29屆臺法文化獎頒獎典禮在法國巴黎法蘭西學院舉行。</p>",
      相關圖片: "",
    },
    {
      title: "2024 年歷史過期公報",
      Source: "https://www.moc.gov.tw/News_Content.aspx?n=105&s=100000",
      上版日期: "2024/1/1 上午 09:00:00",
      內容: "<p>這是兩年前的舊新聞，應被 30 天過濾條件排除。</p>",
    },
  ];

  const items = parseMocOpenDataJson(JSON.stringify(fixture), {
    maxItems: 50,
    maxAgeDays: 30,
    now,
  });

  assert.equal(items.length, 2, "Outdated article must be filtered out");
  assert.equal(items[0].feedCode, "moc_news");
  assert.equal(items[0].sourceName, "moc");
  assert.equal(items[0].feedName, "文化部");
  assert.equal(items[0].deptName, "文化部");
  assert.equal(items[0].title, "「臺北時裝週SS27」即將於10月15日至18日展出");
  assert.equal(items[0].assets.length, 1);
  assert.equal(items[0].assets[0].url, "https://file.moc.gov.tw/001.jpg");
  assert.ok(items[0].detailHtml?.includes("空總國家文化基地"));

  assert.equal(items[1].title, "第29屆臺法文化獎頒獎典禮舉行");
});
