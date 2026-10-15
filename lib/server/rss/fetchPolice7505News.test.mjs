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

const { parsePolice7505Csv, police7505RawSchema } = await import("./fetchPolice7505News.ts");
const { getSourceLabel, hasSourceLabel } = await import("../news/sourceLabels.ts");
const { SOURCE_CATEGORIES, isGovSource } = await import("../news/sourceCategories.ts");
const { classifyNewsTopics } = await import("../news/classifyTopics.ts");

const fixturePath = new URL("./__fixtures__/police-7505-sample.csv", import.meta.url);
const fixtureBuffer = readFileSync(fixturePath);

test("fixture file is UTF-8 with a BOM, as served live by opdadm.moi.gov.tw", () => {
  assert.equal(fixtureBuffer[0], 0xef);
  assert.equal(fixtureBuffer[1], 0xbb);
  assert.equal(fixtureBuffer[2], 0xbf);
});

test("police_7505: source label and gov category registration", () => {
  assert.equal(getSourceLabel("police_7505"), "警政署");
  assert.equal(hasSourceLabel("police_7505"), true);
  assert.equal(isGovSource("police_7505"), true);

  const govCat = SOURCE_CATEGORIES.find((c) => c.key === "gov");
  assert.ok(govCat);
  assert.ok(govCat.sources.some((s) => s.sourceName === "police_7505" && s.label === "警政署"));
});

test("police_7505: has no source override, so topic classification runs the keyword rules", () => {
  const antiFraudHit = classifyNewsTopics({
    title: "投資候選人廣告 當選就分紅？高雄車廠老闆104萬元泡湯",
    summary: "詐騙集團歪腦筋也動到候選人及支持者的身上",
    sourceName: "police_7505",
  });
  assert.deepEqual(antiFraudHit, ["anti-fraud"]);

  const noHit = classifyNewsTopics({
    title: "115年「國慶大會預演」交通管制、疏導措施",
    summary: "臺北市政府警察局為維護本項活動之交通秩序與安全",
    sourceName: "police_7505",
  });
  assert.deepEqual(noHit, []);
});

const fixtureText = readFileSync(fixturePath, "utf-8");

test("parsePolice7505Csv parses real sampled rows and stores full text", () => {
  const items = parsePolice7505Csv(fixtureText);

  // The fixture carries 3 real data rows plus the Chinese-label artifact
  // row, which must be dropped.
  assert.equal(items.length, 3);

  const first = items[0];
  assert.equal(first.title, "投資候選人廣告 當選就分紅？高雄車廠老闆104萬元泡湯");
  assert.equal(first.deptName, "刑事警察局公共關係室");
  assert.equal(first.sourceName, "police_7505");
  assert.equal(first.feedCode, "police_7505_news");
  assert.ok(first.publishedAtUtc instanceof Date);
  // 2026-10-11T14:00 Taipei -> 2026-10-11T06:00 UTC
  assert.equal(first.publishedAtUtc.toISOString(), "2026-10-11T06:00:00.000Z");

  // Full text (content field) is stored, not just a summary — this is the
  // acceptance criterion distinguishing it from a commercial-media source.
  assert.ok(first.detailText.includes("詐騙集團歪腦筋也動到候選人及支持者的身上"));
  assert.ok(first.detailText.includes("刑事警察局呼籲"));
  assert.ok(first.detailHtml.startsWith("<p>"));
});

test("parsePolice7505Csv gives every row a distinct canonical_url and external_id", () => {
  const items = parsePolice7505Csv(fixtureText);
  const urls = new Set(items.map((i) => i.canonicalUrl));
  const ids = new Set(items.map((i) => i.externalId));
  assert.equal(urls.size, items.length, "canonical_url must be unique per row (uq_news_url)");
  assert.equal(ids.size, items.length, "external_id must be unique per row (uq_news_external)");
  for (const item of items) {
    assert.ok(item.canonicalUrl.startsWith("https://data.gov.tw/dataset/7505?article="));
  }
});

test("parsePolice7505Csv identity is stable across a serialNo renumbering (position-based counter, not a real id)", () => {
  // Same 3 articles, but with every serialNo shifted +1 — simulates a new
  // article landing at the top of tomorrow's CSV dump and bumping every
  // existing row's position-based counter. external_id must not change.
  const shifted = fixtureText.replace(/^(\d+),/gm, (_, n) => `${Number(n) + 1},`);
  const original = parsePolice7505Csv(fixtureText);
  const after = parsePolice7505Csv(shifted);
  assert.deepEqual(
    after.map((i) => i.externalId),
    original.map((i) => i.externalId),
  );
});

test("police7505RawSchema rejects a row missing a critical field entirely", () => {
  const result = police7505RawSchema.safeParse({ serialNo: "1", stitle: "t", deptName: "d", postDate: "2026-01-01T00:00" });
  assert.equal(result.success, false);
});
