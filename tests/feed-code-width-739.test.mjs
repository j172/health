import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FEED_CODE_COLUMN_LENGTH,
  FEED_CODE_COLUMNS,
  widenFeedCodeColumns,
} from "../lib/server/db/feedCodeWidth.ts";

// issue #739：news_items.feed_code／ingest_errors.feed_code 原本 VARCHAR(10)，實際來源代碼最長 22 字元，
// 正式站（非嚴格 SQL 模式）靜默截斷。這個檔案守住：
//   1. 寬度常數、schema.ts 的建表敘述、遷移三者一致（63，且 63×4 ≤ 255 以保持單一長度位元組、可原地擴充）。
//   2. 所有已知來源代碼（FeedCode 型別、RSS_FEEDS、各 runSync 的 feed code 常數）長度 ≤ 寬度，擋住未來再超長。
//   3. 遷移行為：冪等（已夠寬 = no-op）、只放寬太窄的欄位、失敗只警告不丟例外。

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

// --- 1. 常數／DDL／遷移一致 ----------------------------------------------------------------------

test("feed code width: 63 keeps a single length byte under utf8mb4 (63 * 4 <= 255), so the ALTER can run in place", () => {
  assert.equal(FEED_CODE_COLUMN_LENGTH, 63);
  assert.ok(FEED_CODE_COLUMN_LENGTH * 4 <= 255, "a wider column needs 2 length bytes and forces a table rebuild");
});

test("schema.ts: news_items.feed_code and ingest_errors.feed_code are declared with the shared width", () => {
  const schema = read("lib", "server", "db", "schema.ts");
  const decls = [...schema.matchAll(/^\s*feed_code VARCHAR\((\d+)\) (NOT NULL|NULL),/gm)];
  assert.equal(decls.length, 2, "expected exactly two feed_code column declarations (news_items, ingest_errors)");
  for (const [, width] of decls) assert.equal(Number(width), FEED_CODE_COLUMN_LENGTH);
  assert.deepEqual(
    decls.map((d) => d[2]),
    ["NOT NULL", "NULL"],
    "news_items.feed_code is NOT NULL, ingest_errors.feed_code is NULL",
  );
  assert.deepEqual(
    FEED_CODE_COLUMNS.map((c) => [c.table, c.column, c.nullable]),
    [
      ["news_items", "feed_code", false],
      ["ingest_errors", "feed_code", true],
    ],
  );
  assert.doesNotMatch(schema, /feed_code VARCHAR\(10\)/);
});

test("mysql.ts: runSchemaMigrations calls the feed_code widening, after the CREATE TABLEs it depends on", () => {
  const mysql = read("lib", "server", "db", "mysql.ts");
  assert.match(mysql, /import \{ widenFeedCodeColumns \} from "\.\/feedCodeWidth"/);
  const call = mysql.indexOf("await widenFeedCodeColumns(");
  assert.ok(call > 0, "widenFeedCodeColumns is not called from runSchemaMigrations");
  assert.ok(call > mysql.indexOf("await p.query(TABLE_DDL.newsItems)"));
  assert.ok(call > mysql.indexOf("await p.query(TABLE_DDL.ingestErrors)"));
});

test("the longest unique key stays far below the InnoDB 3072-byte limit after widening", () => {
  // uq_news_external (source_name VARCHAR(50), feed_code, external_id VARCHAR(100)), utf8mb4 = 4 bytes/char.
  const bytes = (50 + FEED_CODE_COLUMN_LENGTH + 100) * 4;
  assert.ok(bytes <= 3072, `uq_news_external would be ${bytes} bytes`);
  const schema = read("lib", "server", "db", "schema.ts");
  assert.match(schema, /UNIQUE KEY uq_news_external \(source_name, feed_code, external_id\)/);
  assert.match(schema, /KEY idx_news_feed_published \(feed_code, published_at_utc\)/);
});

// --- 2. 所有已知來源代碼都放得下 ---------------------------------------------------------------

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // lib/server/facilities 的 source_key 寫進 facilities.source_key（VARCHAR(40)），不是 feed_code 欄位。
      if (entry.name === "node_modules" || entry.name === "facilities") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

/** 收集所有「會寫進 news_items.feed_code／ingest_errors.feed_code」的字面代碼。 */
const collectKnownFeedCodes = () => {
  const codes = new Map(); // code -> where it was found
  const add = (code, where) => {
    if (!codes.has(code)) codes.set(code, where);
  };

  // (a) FeedCode 聯集型別：包含已退役、但資料列仍留在 news_items 的代碼。
  const rssTypes = stripComments(read("types", "rss.ts"));
  const union = rssTypes.slice(rssTypes.indexOf("export type FeedCode"));
  const unionBody = union.slice(0, union.indexOf(";"));
  for (const m of unionBody.matchAll(/\|\s*"([^"]+)"/g)) add(m[1], "types/rss.ts FeedCode");

  // (b) lib/server 內所有 feedCode: "x"、sourceKey: "x"、*_FEED_CODE／*_SOURCE_KEY = "x"、RSS_FEEDS 的 code: "x"。
  const patterns = [
    /\b(?:feedCode|sourceKey)\s*[:=]\s*"([A-Za-z0-9_-]+)"/g,
    /\b[A-Z0-9_]*(?:FEED_CODE|SOURCE_KEY)\s*(?::\s*\w+\s*)?=\s*"([A-Za-z0-9_-]+)"/g,
    /^\s*code:\s*"([A-Za-z0-9_-]+)"/gm,
  ];
  for (const file of walk(path.join(ROOT, "lib", "server"))) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    for (const re of patterns) {
      for (const m of src.matchAll(re)) add(m[1], path.relative(ROOT, file));
    }
  }
  return codes;
};

test("every known source code fits the widened feed_code column (blocks a future code from being silently truncated again)", () => {
  const codes = collectKnownFeedCodes();
  assert.ok(codes.size >= 120, `expected the scan to find at least 120 codes, found ${codes.size} — did the patterns stop matching?`);
  const tooLong = [...codes].filter(([code]) => code.length > FEED_CODE_COLUMN_LENGTH);
  assert.deepEqual(
    tooLong,
    [],
    `these codes are longer than feed_code VARCHAR(${FEED_CODE_COLUMN_LENGTH}) and would be silently truncated: ${tooLong
      .map(([c, w]) => `${c} (${w})`)
      .join(", ")}`,
  );
});

test("the scan sees the known-long codes that exposed #739 (so the check above cannot pass vacuously)", () => {
  const codes = collectKnownFeedCodes();
  for (const code of [
    "commonhealth_club_new",
    "thenewslens_health",
    "thenewslens_lifestyle",
    "thenewslens_elderly",
    "mirrormedia_healthnews",
  ]) {
    assert.ok(codes.has(code), `${code} not found by the scan`);
  }
  const longest = Math.max(...[...codes.keys()].map((c) => c.length));
  assert.ok(longest > 10, "the longest code must exceed the old VARCHAR(10) limit or this test proves nothing");
  assert.ok(longest <= FEED_CODE_COLUMN_LENGTH);
});

test("codes that used to collide after truncation to 10 chars are all distinct at the new width", () => {
  const codes = [...collectKnownFeedCodes().keys()];
  const oldWidthPrefixes = new Map();
  for (const code of codes) {
    const key = code.slice(0, 10);
    oldWidthPrefixes.set(key, [...(oldWidthPrefixes.get(key) ?? []), code]);
  }
  const collided = [...oldWidthPrefixes.values()].filter((group) => group.length > 1);
  assert.ok(collided.length > 0, "fixture sanity: at least one prefix collision existed at the old width (thenewslens_*)");
  for (const group of collided) {
    const truncatedToNew = new Set(group.map((c) => c.slice(0, FEED_CODE_COLUMN_LENGTH)));
    assert.equal(truncatedToNew.size, group.length, `still colliding at width ${FEED_CODE_COLUMN_LENGTH}: ${group.join(", ")}`);
  }
});

// --- 3. 遷移行為 -------------------------------------------------------------------------------------

/** 假資料庫：維護每個 (table, column) 的目前寬度；ALTER 會真的改它，用來驗證冪等。 */
const makeFakeDb = (widths, { failAlter = false, failInfoSchema = false } = {}) => {
  const calls = [];
  const db = {
    calls,
    widths,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM information_schema\.COLUMNS/i.test(sql)) {
        if (failInfoSchema) throw new Error("information_schema unavailable");
        const key = `${params[0]}.${params[1]}`;
        return [key in widths ? [{ max_length: widths[key] }] : [], []];
      }
      const alter = sql.match(/ALTER TABLE `(\w+)`\s+MODIFY COLUMN `(\w+)` VARCHAR\((\d+)\)/);
      if (alter) {
        if (failAlter) throw new Error("ALGORITHM=INPLACE is not supported");
        widths[`${alter[1]}.${alter[2]}`] = Number(alter[3]);
        return [{ affectedRows: 0 }, []];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  return db;
};

const alters = (db) => db.calls.filter((c) => /ALTER TABLE/i.test(c.sql));

test("migration: widens both columns from 10 to 63 and the ALTER keeps nullability, runs in place and without table lock", async () => {
  const db = makeFakeDb({ "news_items.feed_code": 10, "ingest_errors.feed_code": 10 });
  const result = await widenFeedCodeColumns(db, () => {});
  assert.deepEqual(result.widened, ["news_items.feed_code", "ingest_errors.feed_code"]);
  assert.deepEqual(result.failed, []);
  const [newsAlter, errorsAlter] = alters(db);
  assert.match(newsAlter.sql, /ALTER TABLE `news_items`\s+MODIFY COLUMN `feed_code` VARCHAR\(63\) NOT NULL/);
  assert.match(errorsAlter.sql, /ALTER TABLE `ingest_errors`\s+MODIFY COLUMN `feed_code` VARCHAR\(63\) NULL/);
  for (const a of [newsAlter, errorsAlter]) assert.match(a.sql, /ALGORITHM=INPLACE, LOCK=NONE/);
  // 等 metadata 鎖不能無限久：每個 ALTER 都帶 10 秒的 lock_wait_timeout，否則會讓後面的查詢排在它後面。
  for (const a of [newsAlter, errorsAlter]) assert.match(a.sql, /^\s*SET STATEMENT lock_wait_timeout=10 FOR ALTER TABLE/);
  assert.deepEqual(db.widths, { "news_items.feed_code": 63, "ingest_errors.feed_code": 63 });
});

test("migration: idempotent — a second run issues no ALTER at all", async () => {
  const db = makeFakeDb({ "news_items.feed_code": 10, "ingest_errors.feed_code": 10 });
  await widenFeedCodeColumns(db, () => {});
  const before = alters(db).length;
  const second = await widenFeedCodeColumns(db, () => {});
  assert.equal(alters(db).length, before, "second run must not ALTER again");
  assert.deepEqual(second.widened, []);
  assert.deepEqual(second.unchanged, ["news_items.feed_code", "ingest_errors.feed_code"]);
});

test("migration: an environment that was already widened by hand (even wider than 63) is left alone", async () => {
  const db = makeFakeDb({ "news_items.feed_code": 64, "ingest_errors.feed_code": 255 });
  const result = await widenFeedCodeColumns(db, () => {});
  assert.equal(alters(db).length, 0);
  assert.deepEqual(result.widened, []);
  assert.equal(db.widths["news_items.feed_code"], 64, "never narrows a wider column");
});

test("migration: only the too-narrow column is touched", async () => {
  const db = makeFakeDb({ "news_items.feed_code": 63, "ingest_errors.feed_code": 10 });
  const result = await widenFeedCodeColumns(db, () => {});
  assert.deepEqual(result.widened, ["ingest_errors.feed_code"]);
  assert.equal(alters(db).length, 1);
});

test("migration: a missing table or column is skipped, not an error", async () => {
  const db = makeFakeDb({});
  const warnings = [];
  const result = await widenFeedCodeColumns(db, (m) => warnings.push(m));
  assert.equal(alters(db).length, 0);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(warnings, []);
});

test("migration: an ALTER failure is only a warning — it never throws and the other column is still attempted", async () => {
  const db = makeFakeDb({ "news_items.feed_code": 10, "ingest_errors.feed_code": 10 }, { failAlter: true });
  const warnings = [];
  const result = await widenFeedCodeColumns(db, (m) => warnings.push(m));
  assert.deepEqual(result.failed, ["news_items.feed_code", "ingest_errors.feed_code"]);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /\[ensureSchema\] widening news_items\.feed_code to VARCHAR\(63\) warning:/);
  assert.equal(alters(db).length, 2, "a failure on the first column must not skip the second");
});

test("migration: an information_schema failure is only a warning, and nothing is ALTERed blindly", async () => {
  const db = makeFakeDb({ "news_items.feed_code": 10, "ingest_errors.feed_code": 10 }, { failInfoSchema: true });
  const warnings = [];
  const result = await widenFeedCodeColumns(db, (m) => warnings.push(m));
  assert.equal(alters(db).length, 0);
  assert.equal(result.failed.length, 2);
  assert.equal(warnings.length, 2);
});

test("migration: the helper has no imports (so node --test can load it) and never uses a table-copy algorithm", () => {
  const src = read("lib", "server", "db", "feedCodeWidth.ts");
  assert.doesNotMatch(stripComments(src), /^\s*import\s/m);
  assert.doesNotMatch(stripComments(src), /ALGORITHM=COPY/);
});
