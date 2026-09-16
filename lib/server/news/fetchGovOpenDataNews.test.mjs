import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.MYSQL_HOST = process.env.MYSQL_HOST || "127.0.0.1";
process.env.MYSQL_USER = process.env.MYSQL_USER || "test";
process.env.MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || "test";
process.env.MYSQL_DATABASE = process.env.MYSQL_DATABASE || "test";
process.env.RSS_SYNC_ADMIN_SECRET = process.env.RSS_SYNC_ADMIN_SECRET || "test-secret";

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
      for (const extension of [".ts", ".tsx", ".js", ".mjs"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { GOV_OPENDATA_SOURCES } = await import("../config/gov-opendata-news-sources.ts");
const { toFeedConfig } = await import("./fetchGovOpenDataNews.ts");
const { isGovSource } = await import("./sourceCategories.ts");
const { getSourceLabel } = await import("./sourceLabels.ts");
const { evaluateFreshness } = await import("../rss/freshness.ts");

test("GOV_OPENDATA_SOURCES contains essential public ministries", () => {
  assert(GOV_OPENDATA_SOURCES.length >= 10, "Should contain at least 10 official sources");

  const ministries = new Set(GOV_OPENDATA_SOURCES.map((s) => s.ministry));
  assert(ministries.has("衛生福利部"), "Must contain MOHW");
  assert(ministries.has("環境部"), "Must contain MOENV");
  assert(ministries.has("農業部"), "Must contain MOA");
  assert(ministries.has("內政部"), "Must contain MOI");
  assert(ministries.has("交通部"), "Must contain MOTC");
});

test("toFeedConfig correctly transforms GovOpenDataSource to FeedConfig", () => {
  const sample = GOV_OPENDATA_SOURCES[0];
  const config = toFeedConfig(sample);

  assert.equal(config.code, sample.feedCode);
  assert.equal(config.name, sample.feedName);
  assert.equal(config.url, sample.url);
  assert.equal(config.sourceName, sample.sourceName);
});

test("isGovSource correctly identifies all government open data sources", () => {
  assert.equal(isGovSource("mohw"), true);
  assert.equal(isGovSource("cdc"), true);
  assert.equal(isGovSource("tfda"), true);
  assert.equal(isGovSource("gov_opendata"), true);
  assert.equal(isGovSource("moa"), true);
  assert.equal(isGovSource("nfa"), true);
  assert.equal(isGovSource("motc"), true);
  assert.equal(isGovSource("freeway"), true);
  assert.equal(isGovSource("thb"), true);

  // Non-gov sources must return false
  assert.equal(isGovSource("google_news"), false);
  assert.equal(isGovSource("commonhealth"), false);
  assert.equal(isGovSource("ettoday"), false);
});

test("getSourceLabel resolves Traditional Chinese display labels for gov sources", () => {
  assert.equal(getSourceLabel("gov_opendata"), "政府開放資料");
  assert.equal(getSourceLabel("moa"), "農業部");
  assert.equal(getSourceLabel("nfa"), "內政部消防署");
  assert.equal(getSourceLabel("motc"), "交通部");
  assert.equal(getSourceLabel("freeway"), "交通部高速公路局");
  assert.equal(getSourceLabel("thb"), "交通部公路局");
});

test("Dual-track freshness logic distinguishes recent vs historical items", () => {
  const now = new Date();
  
  // 10 days ago (recent / fresh)
  const recentDate = new Date(now.getTime() - 10 * 86400000);
  const recentVerdict = evaluateFreshness({ publishedAtUtc: recentDate }, now, 90);
  assert.equal(recentVerdict.fresh, true);
  assert.equal(recentVerdict.reason, "fresh");

  // 120 days ago (historical / too old)
  const oldDate = new Date(now.getTime() - 120 * 86400000);
  const oldVerdict = evaluateFreshness({ publishedAtUtc: oldDate }, now, 90);
  assert.equal(oldVerdict.fresh, false);
  assert.equal(oldVerdict.reason, "too-old");
});
