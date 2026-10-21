import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  COLUMN_WIDTH_TARGETS,
  MAX_RESPONSE_BYTES,
  REPORT_NAMES,
  ROW_COUNT_TABLES,
  TYPHOON_DATASET_ID,
  clipText,
  handleDiagnosticsRequest,
} from "../lib/server/ops/diagnostics.ts";

// issue #738：管理端唯讀診斷彙總端點。行為測試用假的查詢函式直接驅動 handleDiagnosticsRequest
// （路由本身只做金鑰驗證與接資料庫連線，結構另外檢查）：
//   - 未授權 401 且完全不查詢
//   - 白名單外的名稱、多餘參數、非法數字 400 且完全不查詢
//   - 輸出只含白名單欄位（假資料列故意塞了描述全文與機密樣的欄位）
//   - 颱風樣本的截斷（120 字元）與上限（20）
//   - 回應大小上限

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

const recordingQuery = (responder = () => []) => {
  const calls = [];
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    return responder(sql, params);
  };
  return { query, calls };
};

const call = async (qs, { authorized = true, responder } = {}) => {
  const { query, calls } = recordingQuery(responder);
  const logs = [];
  const result = await handleDiagnosticsRequest({
    authorized,
    searchParams: new URLSearchParams(qs),
    query,
    log: (line) => logs.push(line),
    caller: "203.0.113.9",
  });
  return { result, calls, logs };
};

// ---------------------------------------------------------------------------------------------
// 驗證與白名單
// ---------------------------------------------------------------------------------------------

test("unauthorized callers get 401 and no query runs, whatever they ask for", async () => {
  for (const qs of ["", "report=table-row-counts", "report=nope", "evil=1"]) {
    const { result, calls } = await call(qs, { authorized: false });
    assert.equal(result.status, 401, qs);
    assert.deepEqual(result.body, { ok: false, error: "Unauthorized" });
    assert.equal(calls.length, 0);
  }
});

test("a report name outside the whitelist is rejected with 400 and nothing is queried", async () => {
  const hostile = [
    "nope",
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
    "table-row-counts; DROP TABLE news_items",
    "TABLE-ROW-COUNTS",
    "",
    "news_items",
    "SELECT * FROM users",
  ];
  for (const name of hostile) {
    const { result, calls } = await call(new URLSearchParams({ report: name }).toString());
    assert.equal(result.status, 400, name);
    assert.equal(result.body.ok, false);
    assert.equal(calls.length, 0, `no query for ${JSON.stringify(name)}`);
  }
});

test("unknown, repeated or report-inapplicable parameters are rejected with 400 and nothing is queried", async () => {
  const bad = [
    "foo=1",
    "report=table-row-counts&table=users",
    "report=table-row-counts&days=3",
    "report=table-row-counts&limit=3",
    "report=news-feed-stats&limit=3",
    "report=typhoon-alert-sample&days=3",
    "report=column-widths&sql=select 1",
    "report=typhoon-alert-sample&limit=3&limit=4",
    "report=news-feed-stats&days=0",
    "report=news-feed-stats&days=15",
    "report=news-feed-stats&days=abc",
    "report=news-feed-stats&days=-1",
    "report=news-feed-stats&days=1.5",
    "report=news-feed-stats&days=",
    "report=typhoon-alert-sample&limit=0",
    "report=typhoon-alert-sample&limit=21",
    "report=typhoon-alert-sample&limit=1;DROP",
    "days=3",
  ];
  for (const qs of bad) {
    const { result, calls } = await call(qs);
    assert.equal(result.status, 400, qs);
    assert.equal(calls.length, 0, qs);
  }
});

test("with no report the endpoint lists the whitelist without touching the database", async () => {
  const { result, calls } = await call("");
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.reports.map((r) => r.name).sort(),
    ["column-widths", "news-feed-stats", "schedule-latest-runs", "table-row-counts", "typhoon-alert-sample"],
  );
  assert.deepEqual([...REPORT_NAMES].sort(), result.body.reports.map((r) => r.name).sort());
  assert.equal(calls.length, 0);
});

test("a call logs one line with caller, report, status and elapsed ms — never the secret", async () => {
  const { logs } = await call("report=table-row-counts", { responder: () => [{ n: 1 }] });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\[admin-diagnostics\] caller=203\.0\.113\.9 report=table-row-counts status=200 ms=\d+$/);
  const denied = await call("report=table-row-counts", { authorized: false });
  assert.equal(denied.logs.length, 1);
  assert.match(denied.logs[0], /status=401/);
});

// ---------------------------------------------------------------------------------------------
// SQL 都是唯讀常數；使用者輸入只會是綁定參數
// ---------------------------------------------------------------------------------------------

test("every statement issued is a read-only SELECT and user input only ever travels as a bound parameter", async () => {
  const allCalls = [];
  for (const qs of [
    "report=news-feed-stats&days=7",
    "report=column-widths",
    "report=table-row-counts",
    "report=schedule-latest-runs",
    "report=typhoon-alert-sample&limit=7",
  ]) {
    const { calls } = await call(qs, { responder: () => [] });
    allCalls.push(...calls);
  }
  assert.ok(allCalls.length > 5);
  for (const { sql } of allCalls) {
    assert.match(sql.trim(), /^SELECT\b/i, sql);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REPLACE|INTO\s+OUTFILE|LOAD_FILE)\b/i, sql);
    assert.doesNotMatch(sql, /;/);
  }
  const typhoon = allCalls.filter((c) => /FROM cwa_alerts/.test(c.sql));
  assert.ok(typhoon.some((c) => c.params.includes(7)), "limit travels as a bound parameter");
  assert.ok(typhoon.every((c) => c.params[0] === TYPHOON_DATASET_ID));
});

// ---------------------------------------------------------------------------------------------
// 輸出形狀
// ---------------------------------------------------------------------------------------------

test("news-feed-stats aggregates per-feed ok/failed counts, last ok time and a clipped last error, and exposes nothing else", async () => {
  const run = (id, startedAt, feedResults, extra = {}) => ({
    id,
    started_at: new Date(startedAt),
    summary_json: { trigger: "internal-cron", feedResults, secretField: "SHOULD-NOT-LEAK", ...extra },
  });
  const failing = (code, message, httpStatus = 403) => ({
    feed: { code, name: "n", url: "https://example.test/feed?token=abc123&x=1", sourceName: "s" },
    ok: false,
    httpStatus,
    itemCount: 0,
    errorMessage: message,
  });
  const good = (code) => ({ feed: { code, name: "n", url: "u", sourceName: "s" }, ok: true, httpStatus: 200, itemCount: 5 });
  const pages = [
    [
      run(30, "2026-10-21T03:00:00Z", [failing("nhi_web", `HTTP 403 at https://x.test/a?token=SUPERSECRET&y=2 ${"長".repeat(400)}`), good("moe_news")]),
      run(29, "2026-10-21T02:00:00Z", [failing("nhi_web", "older error"), good("moe_news")]),
    ],
  ];
  const { result, calls } = await call("report=news-feed-stats&days=2", {
    responder: (sql) => {
      if (/FROM ingest_runs/.test(sql)) return pages.shift() ?? [];
      if (/FROM ingest_errors/.test(sql)) return [{ feed_code: "nhi_web", error_rows: 3, message: "RAW MESSAGE SHOULD NOT APPEAR" }];
      return [];
    },
  });
  assert.equal(result.status, 200);
  const { data } = result.body;
  assert.equal(data.days, 2);
  assert.equal(data.runsScanned, 2);
  const nhi = data.feeds.find((f) => f.feed === "nhi_web");
  assert.deepEqual(Object.keys(nhi).sort(), ["failed", "feed", "lastError", "lastFailedAt", "lastHttpStatus", "lastOkAt", "ok"]);
  assert.equal(nhi.failed, 2);
  assert.equal(nhi.ok, 0);
  assert.equal(nhi.lastOkAt, null);
  assert.equal(nhi.lastFailedAt, "2026-10-21T03:00:00.000Z");
  assert.equal(nhi.lastHttpStatus, 403);
  assert.ok(Array.from(nhi.lastError).length <= 160);
  assert.ok(!nhi.lastError.includes("SUPERSECRET"));
  assert.match(nhi.lastError, /token=\*\*\*/);
  const moe = data.feeds.find((f) => f.feed === "moe_news");
  assert.equal(moe.ok, 2);
  assert.equal(moe.lastOkAt, "2026-10-21T03:00:00.000Z");
  assert.deepEqual(data.ingestErrorRows, [{ feedCode: "nhi_web", count: 3 }]);
  // failing feeds sort first
  assert.equal(data.feeds[0].feed, "nhi_web");
  const text = JSON.stringify(result.body);
  assert.ok(!text.includes("SHOULD-NOT-LEAK"));
  assert.ok(!text.includes("RAW MESSAGE SHOULD NOT APPEAR"));
  assert.ok(!text.includes("https://example.test"));
  assert.ok(calls.length >= 2);
});

test("news-feed-stats stops paging once the scan cap is reached", async () => {
  let page = 0;
  const { result } = await call("report=news-feed-stats", {
    responder: (sql) => {
      if (!/FROM ingest_runs/.test(sql)) return [];
      page += 1;
      return Array.from({ length: 20 }, (_, i) => ({ id: 100000 - page * 20 - i, started_at: new Date("2026-10-21T00:00:00Z"), summary_json: JSON.stringify({ feedResults: [] }) }));
    },
  });
  assert.equal(result.status, 200);
  assert.ok(result.body.data.runsScanned <= 600);
  assert.ok(page <= 30);
});

test("column-widths reports only the whitelisted pairs, even if the database returns more", async () => {
  const { result } = await call("report=column-widths", {
    responder: () => [
      { table_name: "news_items", column_name: "feed_code", column_type: "varchar(10)", max_length: 10, is_nullable: "NO" },
      { table_name: "users", column_name: "password", column_type: "varchar(255)", max_length: 255, is_nullable: "NO" },
    ],
  });
  assert.equal(result.status, 200);
  const cols = result.body.data.columns;
  assert.equal(cols.length, COLUMN_WIDTH_TARGETS.length);
  const feedCode = cols.find((c) => c.table === "news_items" && c.column === "feed_code");
  assert.deepEqual(feedCode, { table: "news_items", column: "feed_code", exists: true, type: "varchar(10)", maxLength: 10, nullable: false });
  assert.ok(!JSON.stringify(result.body).includes("password"));
  assert.ok(cols.some((c) => c.exists === false));
});

test("table-row-counts returns a number per whitelisted table and null (not an error) for a table that fails", async () => {
  const { result, calls } = await call("report=table-row-counts", {
    responder: (sql) => {
      if (sql.includes("`ingest_errors`")) throw new Error("Table 'db.ingest_errors' doesn't exist: password=hunter2");
      return [{ n: "42" }];
    },
  });
  assert.equal(result.status, 200);
  assert.equal(calls.length, ROW_COUNT_TABLES.length);
  assert.deepEqual(result.body.data.tables.map((t) => t.table), [...ROW_COUNT_TABLES]);
  assert.equal(result.body.data.tables.find((t) => t.table === "news_items").rows, 42);
  assert.equal(result.body.data.tables.find((t) => t.table === "ingest_errors").rows, null);
  assert.ok(!JSON.stringify(result.body).includes("hunter2"));
});

test("schedule-latest-runs returns only the summary columns with clipped errors", async () => {
  const { result } = await call("report=schedule-latest-runs", {
    responder: () => [
      {
        trigger_type: "internal-cron",
        status: "failed",
        started_at: new Date("2026-10-21T01:00:00Z"),
        ended_at: new Date("2026-10-21T01:10:00Z"),
        duration_ms: 600000,
        failed_feeds_count: 4,
        error_message: "boom ".repeat(200),
        summary_json: '{"huge":"RAW SUMMARY"}',
        fetched_count: 1,
      },
    ],
  });
  assert.equal(result.status, 200);
  const [row] = result.body.data.latestRunPerTrigger;
  assert.deepEqual(Object.keys(row).sort(), ["durationMs", "endedAt", "error", "failedFeeds", "startedAt", "status", "trigger"]);
  assert.ok(Array.from(row.error).length <= 160);
  assert.ok(!JSON.stringify(result.body).includes("RAW SUMMARY"));
});

// ---------------------------------------------------------------------------------------------
// 颱風警報資料樣本
// ---------------------------------------------------------------------------------------------

const alertRow = (i, overrides = {}) => ({
  event: "海上陸上颱風警報",
  headline: `颱風標題${i}`,
  effective: new Date("2026-10-21T00:00:00Z"),
  expires: new Date("2026-10-22T00:00:00Z"),
  description: "FULL DESCRIPTION BODY",
  instruction: "FULL INSTRUCTION BODY",
  area_desc: "AREA",
  web: "https://cwa.example/secret",
  alert_key: "KEY",
  ...overrides,
});

test("typhoon-alert-sample returns only event/headline/effective/expires plus the row count, headline clipped to 120 chars", async () => {
  const long = "颱".repeat(300);
  const { result, calls } = await call("report=typhoon-alert-sample&limit=3", {
    responder: (sql) => (/COUNT\(\*\)/.test(sql) ? [{ n: 57 }] : [alertRow(1, { headline: long }), alertRow(2), alertRow(3)]),
  });
  assert.equal(result.status, 200);
  const { data } = result.body;
  assert.equal(data.datasetId, "W-C0034-001");
  assert.equal(data.totalRows, 57);
  assert.equal(data.returned, 3);
  assert.equal(data.limit, 3);
  assert.deepEqual(Object.keys(data.rows[0]).sort(), ["effective", "event", "expires", "headline"]);
  assert.equal(Array.from(data.rows[0].headline).length, 120);
  assert.equal(data.rows[0].effective, "2026-10-21T00:00:00.000Z");
  const text = JSON.stringify(result.body);
  for (const leaked of ["FULL DESCRIPTION BODY", "FULL INSTRUCTION BODY", "AREA", "cwa.example", "KEY"]) assert.ok(!text.includes(leaked), leaked);
  const select = calls.find((c) => !/COUNT/.test(c.sql));
  assert.match(select.sql, /SELECT event, headline, effective, expires/);
  assert.deepEqual(select.params, ["W-C0034-001", 3]);
});

test("typhoon-alert-sample defaults to 5 rows, caps at 20 and never returns more than the limit even if the database over-delivers", async () => {
  const many = Array.from({ length: 50 }, (_, i) => alertRow(i));
  const def = await call("report=typhoon-alert-sample", { responder: (sql) => (/COUNT/.test(sql) ? [{ n: 50 }] : many) });
  assert.equal(def.result.body.data.limit, 5);
  assert.equal(def.result.body.data.rows.length, 5);
  const max = await call("report=typhoon-alert-sample&limit=20", { responder: (sql) => (/COUNT/.test(sql) ? [{ n: 50 }] : many) });
  assert.equal(max.result.body.data.rows.length, 20);
  assert.equal(max.calls.find((c) => !/COUNT/.test(c.sql)).params[1], 20);
});

test("typhoon-alert-sample with an empty table still answers with a zero count and no rows", async () => {
  const { result } = await call("report=typhoon-alert-sample", { responder: (sql) => (/COUNT/.test(sql) ? [{ n: 0 }] : []) });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data.rows, []);
  assert.equal(result.body.data.totalRows, 0);
  assert.equal(result.body.data.returned, 0);
});

// ---------------------------------------------------------------------------------------------
// 錯誤與大小上限
// ---------------------------------------------------------------------------------------------

test("a database failure yields a fixed 500 body that carries no error text", async () => {
  const { result } = await call("report=schedule-latest-runs", {
    responder: () => {
      throw new Error("Access denied for user 'x'@'host' (using password: YES) mysql://user:hunter2@db");
    },
  });
  assert.equal(result.status, 500);
  assert.ok(!JSON.stringify(result.body).includes("hunter2"));
  assert.ok(!JSON.stringify(result.body).includes("Access denied"));
});

test("a response over the size cap is replaced by a small error", async () => {
  // 100 個 feed、代碼與錯誤訊息都用全形字寫滿（UTF-8 每字 3 bytes），一定超過 64 KB。
  const feedResults = Array.from({ length: 150 }, (_, i) => ({
    feed: { code: String.fromCharCode(0x4e00 + i).repeat(64) },
    ok: false,
    httpStatus: 500,
    errorMessage: "錯".repeat(400),
  }));
  const { result } = await call("report=news-feed-stats", {
    responder: (sql) => (/FROM ingest_runs/.test(sql) ? [{ id: 5, started_at: new Date("2026-10-21T00:00:00Z"), summary_json: { feedResults } }] : []),
  });
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { ok: false, report: "news-feed-stats", error: "response too large" });
  assert.equal(MAX_RESPONSE_BYTES, 64 * 1024);
});

test("clipText flattens whitespace, clips by code point and masks secret-looking query values", () => {
  assert.equal(clipText(null, 10), null);
  assert.equal(clipText("a\n\n b\t c", 10), "a b c");
  assert.equal(clipText("😀".repeat(5), 3), "😀😀😀");
  assert.equal(clipText("https://h.test/x?apikey=ABC&k=1", 100), "https://h.test/x?apikey=***&k=1");
  assert.equal(clipText("Authorization: Bearer abcdefghijklmnop", 100), "Authorization: Bearer ***");
});

// ---------------------------------------------------------------------------------------------
// 結構：路由與白名單內容
// ---------------------------------------------------------------------------------------------

test("the route authenticates with requireAdminSecret, is GET-only, and passes the verdict into the handler", () => {
  const src = read("app/api/admin/diagnostics/route.ts");
  assert.match(src, /requireAdminSecret\(request\)/);
  assert.match(src, /authorized: denied === null/);
  assert.match(src, /export async function GET/);
  assert.doesNotMatch(src, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(src, /no-store/);
  assert.doesNotMatch(src, /process\.env|\.env\b|readFile/);
});

test("the whitelisted tables and columns exist in the schema definitions", () => {
  const schema = read("lib/server/db/schema.ts");
  const mysqlSrc = read("lib/server/db/mysql.ts");
  const defined = new Set([...(schema + mysqlSrc).matchAll(/CREATE TABLE IF NOT EXISTS\s+`?([a-z0-9_]+)`?/gi)].map((m) => m[1]));
  for (const table of ROW_COUNT_TABLES) assert.ok(defined.has(table), `${table} is not a known table`);
  for (const [table] of COLUMN_WIDTH_TARGETS) assert.ok(defined.has(table), `${table} is not a known table`);
  assert.deepEqual(new Set(ROW_COUNT_TABLES).size, ROW_COUNT_TABLES.length);
});

test("the diagnostics module imports nothing that could read secrets or run arbitrary code", () => {
  const src = read("lib/server/ops/diagnostics.ts");
  assert.doesNotMatch(src, /^import\b/m);
  assert.doesNotMatch(src, /process\.env|node:fs|child_process|\beval\(|new Function/);
});

test("the endpoint is documented where the other admin diagnostics endpoint is", () => {
  const doc = read("docs/domains/11-hosting-ops-incidents.md");
  assert.match(doc, /\/api\/admin\/diagnostics/);
});
