// Guard: the hand-written "scale numbers" in the four portfolio READMEs
// (README.md / README.en.md / README.ja.md / README.ko.md) must match the code.
//
// Why: the previous README claimed 79 tools while TOOL_CATALOG already had 86,
// and nobody noticed because the number was typed by hand. The numbers stay
// hand-written (they are marketing copy), but this test recomputes them from the
// source of truth and fails when any README disagrees:
//
//   tools        -> entries of TOOL_CATALOG in lib/server/tools/catalog.ts
//   cron         -> cron.schedule( calls in lib/server/cron/registerJobs.ts
//   news-sources -> distinct sourceName values in lib/server/news/sourceCategories.ts
//
// Each README must carry every number in two forms:
//   1. inline, wrapped in an invisible marker:  <!--scale:tools-->86<!--/scale-->
//   2. a static shields.io badge:               https://img.shields.io/badge/<label>-86-<color>
// and must not mention a tool count anywhere else without the marker
// (a bare "70+ tools" is exactly how the old README went stale).
//
// This test only reads text files: no database, no network, no TypeScript import.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), "utf8");

// ---------------------------------------------------------------- source of truth

function countTools() {
  const text = read("lib/server/tools/catalog.ts");
  const start = text.indexOf("export const TOOL_CATALOG");
  const end = text.indexOf("TOOL_CATALOG.sort(");
  assert.ok(start >= 0 && end > start, "TOOL_CATALOG array boundaries not found in catalog.ts");
  // Top-level entries of the array are indented by 4 spaces inside `  {`.
  const slugs = text.slice(start, end).match(/^ {4}slug: "[^"]+"/gm) ?? [];
  assert.equal(new Set(slugs).size, slugs.length, "duplicate slug lines in TOOL_CATALOG");
  return slugs.length;
}

function countCronJobs() {
  const code = read("lib/server/cron/registerJobs.ts")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");
  return (code.match(/\bcron\.schedule\(/g) ?? []).length;
}

function countNewsSources() {
  const text = read("lib/server/news/sourceCategories.ts");
  const start = text.indexOf("export const SOURCE_CATEGORIES");
  assert.ok(start >= 0, "SOURCE_CATEGORIES not found in sourceCategories.ts");
  const names = [...text.slice(start).matchAll(/sourceName: "([^"]+)"/g)].map((m) => m[1]);
  return new Set(names).size;
}

const ACTUAL = {
  tools: countTools(),
  cron: countCronJobs(),
  "news-sources": countNewsSources(),
};

// ---------------------------------------------------------------- README table

const READMES = [
  {
    file: "README.md",
    badgeLabels: { tools: "工具", cron: "排程", "news-sources": "新聞來源" },
    // A tool count written without the marker, e.g. "86 款" or "70+ 款".
    strayTools: /\d+\+?\s*款/,
  },
  {
    file: "README.en.md",
    badgeLabels: { tools: "tools", cron: "scheduled jobs", "news-sources": "news sources" },
    strayTools: /\d+\+?\s+(?:[\w-]+\s+)?tools\b/i,
  },
  {
    file: "README.ja.md",
    badgeLabels: { tools: "ツール", cron: "定期ジョブ", "news-sources": "ニュースソース" },
    strayTools: /\d+\+?\s*(?:種類|款|個)?のツール/,
  },
  {
    file: "README.ko.md",
    badgeLabels: { tools: "도구", cron: "예약 작업", "news-sources": "뉴스 출처" },
    strayTools: /\d+\+?\s*개의?\s*도구/,
  },
];

const MARKER = /<!--scale:([a-z-]+)-->(\d+)<!--\/scale-->/g;

function badgeValues(text) {
  // https://img.shields.io/badge/<label>-<message>-<color>  (label/message use "_" for spaces)
  const out = [];
  for (const m of text.matchAll(/img\.shields\.io\/badge\/([^"\s)?]+)/g)) {
    const parts = decodeURIComponent(m[1]).split("-");
    if (parts.length < 3) continue;
    out.push({ label: parts[0].replace(/_/g, " "), message: parts[1].replace(/_/g, " ") });
  }
  return out;
}

test("source-of-truth counters are sane", () => {
  for (const [key, value] of Object.entries(ACTUAL)) {
    assert.ok(Number.isInteger(value) && value > 0, `${key} count must be a positive integer, got ${value}`);
  }
});

for (const { file, badgeLabels, strayTools } of READMES) {
  test(`${file}: exists and links to the other language versions`, () => {
    assert.ok(fs.existsSync(new URL(file, ROOT)), `${file} is missing`);
    const text = read(file);
    const head = text.split("\n").slice(0, 40).join("\n");
    for (const other of READMES.map((r) => r.file).filter((f) => f !== file)) {
      assert.ok(head.includes(`](${other})`), `${file}: language switcher near the top must link to ${other}`);
    }
  });

  test(`${file}: inline scale markers match the code`, () => {
    const text = read(file);
    const found = {};
    for (const m of text.matchAll(MARKER)) {
      assert.ok(m[1] in ACTUAL, `${file}: unknown scale marker "${m[1]}"`);
      (found[m[1]] ??= []).push(Number(m[2]));
    }
    for (const [key, actual] of Object.entries(ACTUAL)) {
      assert.ok(found[key]?.length, `${file}: needs at least one <!--scale:${key}-->N<!--/scale--> marker`);
      for (const value of found[key]) {
        assert.equal(value, actual, `${file}: scale marker "${key}" says ${value} but the code has ${actual}`);
      }
    }
  });

  test(`${file}: scale badges match the code`, () => {
    const badges = badgeValues(read(file));
    for (const [key, actual] of Object.entries(ACTUAL)) {
      const label = badgeLabels[key];
      const hits = badges.filter((b) => b.label === label);
      assert.ok(hits.length, `${file}: needs a shields.io static badge labelled "${label}" (${key})`);
      for (const hit of hits) {
        assert.equal(Number.parseInt(hit.message, 10), actual, `${file}: badge "${label}" says ${hit.message} but the code has ${actual}`);
      }
    }
  });

  test(`${file}: no unmarked tool count`, () => {
    const prose = read(file)
      .replace(MARKER, "")
      .replace(/<img[^>]*>/g, "")
      .replace(/<!--[\s\S]*?-->/g, "");
    const stray = prose.match(strayTools);
    assert.ok(!stray, `${file}: tool count "${stray?.[0]}" is not wrapped in <!--scale:tools-->…<!--/scale-->`);
  });

  test(`${file}: relative links resolve and nothing points into docs/archive`, () => {
    const text = read(file);
    assert.ok(!/docs\/archive/.test(text), `${file}: docs/archive was removed; link docs/README.md instead`);
    const targets = [
      ...[...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]),
      ...[...text.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
    ];
    for (const target of targets) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
      const rel = decodeURIComponent(target.split("#")[0].split("?")[0]);
      if (!rel) continue;
      assert.ok(fs.existsSync(new URL(rel, ROOT)), `${file}: relative link target does not exist: ${target}`);
    }
  });
}
