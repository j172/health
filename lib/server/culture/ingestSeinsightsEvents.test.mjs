import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

process.env.MYSQL_HOST = "localhost";
process.env.MYSQL_USER = "test";
process.env.MYSQL_PASSWORD = "test";
process.env.MYSQL_DATABASE = "test";
process.env.RSS_SYNC_ADMIN_SECRET = "test";

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

const {
  parseNextDataFromHtml,
  extractEventLocationAndSummary,
  runSeinsightsEventsSync,
} = await import("./ingestSeinsightsEvents.ts");

test("Seinsights Events: runSeinsightsEventsSync is exported and is a function", () => {
  assert.equal(typeof runSeinsightsEventsSync, "function");
});

test("Seinsights Events: parseNextDataFromHtml extracts __NEXT_DATA__ correctly", () => {
  const fakeHtml = `
    <html>
      <head><title>Test</title></head>
      <body>
        <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"test":123}}}</script>
      </body>
    </html>
  `;
  const data = parseNextDataFromHtml(fakeHtml);
  assert.ok(data);
  assert.equal(data.props?.pageProps?.test, 123);
});

test("Seinsights Events: extractEventLocationAndSummary detects physical address and city", () => {
  const mockEventData = {
    name: "Impact Star 成果展",
    content: JSON.stringify({
      blocks: [
        { text: "活動簡介：這是一場精彩的社會創新成果展，歡迎共襄盛舉。" },
        { text: "地點：新北市青職基地（新北市板橋區民權路 170 號）" },
      ],
    }),
  };

  const res = extractEventLocationAndSummary(mockEventData);
  assert.ok(res.description.includes("活動簡介"));
  assert.equal(res.city, "新北市");
  assert.ok(res.location.includes("新北市板橋區民權路"));
  assert.equal(res.locationName, "新北市青職基地");
});

test("Seinsights Events: extractEventLocationAndSummary falls back to online for webinars without address", () => {
  const mockEventData = {
    name: "企業永續神助攻線上講座",
    content: JSON.stringify({
      blocks: [
        { text: "【線上講座】本活動將於 Zoom 平台舉辦，歡迎免費報名參與！" },
      ],
    }),
  };

  const res = extractEventLocationAndSummary(mockEventData);
  assert.equal(res.location, "線上活動 / 全國參與");
  assert.equal(res.locationName, "線上活動");
  assert.equal(res.city, null);
});
