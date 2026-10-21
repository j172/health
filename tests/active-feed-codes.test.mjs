import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SPECIAL_SOURCE_FEED_CODES } from "../lib/server/config/special-source-feed-codes.ts";

// issue #738 跟進：news-feed-stats／ingest_errors 分組彙總要排除不在「現行清單」內的
// feed_code（已退役的，例如 #705 下架的 tase_news、commonhealth_club_new），現行清單 =
// RSS_FEEDS ＋ SPECIAL_SOURCE_FEED_CODES。RSS_FEEDS 本身就是 lib/server/rss/runIngestion.ts
// 唯一會 import 的陣列，不會跟原始碼脫鉤；但 SPECIAL_SOURCE_FEED_CODES 是手動列舉的（見該檔案
// 開頭的說明：runIngestion.ts 的 special source 沒有單一可 import 的陣列），所以這裡直接讀
// runIngestion.ts 的原始碼，逐一比對兩邊的 feed_code 集合，防止兩邊將來各自改了卻忘了同步。

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

test("SPECIAL_SOURCE_FEED_CODES matches every feed_code registered via processSpecialSource in runIngestion.ts", () => {
  const src = read("lib/server/rss/runIngestion.ts");
  const registered = new Set([...src.matchAll(/code:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]));
  const declared = new Set(SPECIAL_SOURCE_FEED_CODES);

  assert.ok(
    registered.size > 10,
    `sanity check failed: only found ${registered.size} \`code: "..."\` literals in runIngestion.ts — did the file move, or did the special-source registration style change? If so, update both runIngestion.ts's shape and this test's extraction pattern together.`,
  );

  for (const code of registered) {
    assert.ok(
      declared.has(code),
      `runIngestion.ts registers special source "${code}" via processSpecialSource, but it is missing from SPECIAL_SOURCE_FEED_CODES (lib/server/config/special-source-feed-codes.ts) — the admin diagnostics news-feed-stats report would wrongly treat a currently-active feed as retired and hide its stats.`,
    );
  }
  for (const code of declared) {
    assert.ok(
      registered.has(code),
      `SPECIAL_SOURCE_FEED_CODES lists "${code}" but runIngestion.ts no longer registers it via processSpecialSource — if it was retired, remove it from SPECIAL_SOURCE_FEED_CODES too (that is the whole point of this list: it must only ever contain feed_codes that are currently running).`,
    );
  }
});

test("SPECIAL_SOURCE_FEED_CODES has no duplicate entries", () => {
  assert.equal(new Set(SPECIAL_SOURCE_FEED_CODES).size, SPECIAL_SOURCE_FEED_CODES.length);
});

test("SPECIAL_SOURCE_FEED_CODES does not include feed_codes retired in issue #92 or #705", () => {
  // tase_news / commonhealth_club_new (issue #705, the two codes this change exists to
  // exclude from news-feed-stats) and the seven issue #92 retirements stay in
  // types/rss.ts's FeedCode union forever (old news_items rows still need a legal
  // type), but none of them should ever show up in SPECIAL_SOURCE_FEED_CODES — the
  // previous test already confirms this list exactly matches runIngestion.ts's live
  // registrations, so this is a belt-and-braces check on the two names that matter most.
  const retired = ["tase_news", "commonhealth_club_new", "healthforall", "twhealth", "love_newlife", "durex_article", "commonhealth_club"];
  for (const code of retired) {
    assert.ok(!SPECIAL_SOURCE_FEED_CODES.includes(code), `${code} was retired and must not be in SPECIAL_SOURCE_FEED_CODES`);
  }
});
