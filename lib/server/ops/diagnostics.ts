/**
 * 管理端唯讀診斷彙總（issue #738）。
 *
 * 目的：診斷正式站資料庫狀態時，不必讀主機上的機密、也不必直連資料庫。呼叫者只能從下面 REPORTS 白名單挑一種「事先寫死的彙總」，
 * 不能傳入任何 SQL、表名或欄位名；所有 SQL 都是這個檔案裡的常數，使用者輸入只會以綁定參數（?）的形式出現，而且已先驗證成整數。
 *
 * 這個檔案刻意不 import 任何 `@/` 別名模組、也不 import next/server，讓 node:test 可以直接載入並用假的查詢函式驗證：
 * 授權失敗不會執行任何查詢、白名單外的名稱與多餘參數回 400、輸出只含白名單欄位、颱風樣本的截斷與上限、回應大小上限。
 */

/** 一次查詢：傳入 SQL 與綁定參數，回傳列。由路由以真正的連線實作，測試用假的。 */
export type DiagnosticsQuery = (sql: string, params?: ReadonlyArray<string | number>) => Promise<Array<Record<string, unknown>>>;

export interface DiagnosticsResult {
  status: number;
  body: Record<string, unknown>;
}

export const MAX_RESPONSE_BYTES = 64 * 1024;

const SHORT_TEXT = 160;
const HEADLINE_MAX_CHARS = 120;
const EVENT_MAX_CHARS = 60;

export const TYPHOON_DATASET_ID = "W-C0034-001";
export const TYPHOON_LIMIT_DEFAULT = 5;
export const TYPHOON_LIMIT_MAX = 20;
export const FEED_DAYS_DEFAULT = 3;
export const FEED_DAYS_MAX = 14;
/** 掃描 ingest_runs 的列數上限（每頁 20 列，分頁讀取，避免一次把大量 summary_json 讀進記憶體）。 */
export const FEED_RUNS_SCAN_MAX = 600;
const FEED_RUNS_PAGE = 20;
const FEED_ROWS_MAX = 100;
const LATEST_RUN_ROWS_MAX = 60;

/** 欄位寬度彙總可查的 (表, 欄位)。 */
export const COLUMN_WIDTH_TARGETS: ReadonlyArray<readonly [string, string]> = [
  ["news_items", "feed_code"],
  ["news_items", "source_name"],
  ["ingest_errors", "feed_code"],
  ["ingest_runs", "trigger_type"],
  ["cwa_alerts", "dataset_id"],
  ["cwa_alerts", "event"],
  ["cwa_alerts", "headline"],
];

/** 列數彙總可查的表（全為既有表，名稱與 lib/server/db/schema.ts 一致，由測試守住）。 */
export const ROW_COUNT_TABLES: ReadonlyArray<string> = [
  "news_items",
  "news_assets",
  "ingest_runs",
  "ingest_errors",
  "cwa_alerts",
  "cwa_station_weather",
  "cwa_rainfall",
  "aqi_readings",
  "facilities",
];

// ---------------------------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------------------------

const SECRET_QUERY_PARAM = /([?&;](?:api[_-]?key|key|token|access[_-]?token|secret|password|passwd|auth|authorization|signature|sig)=)[^&\s"']*/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** 壓成單行、遮蔽網址查詢字串裡常見的金鑰參數，再依「字元」（不是 UTF-16 單位）截斷。 */
export const clipText = (value: unknown, maxChars: number): string | null => {
  if (value === null || value === undefined) return null;
  const flat = String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(SECRET_QUERY_PARAM, "$1***")
    .replace(BEARER, "$1 ***");
  const chars = Array.from(flat);
  return chars.length <= maxChars ? flat : chars.slice(0, maxChars).join("");
};

const toIso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  // 後備：字串形式的 DATETIME 原樣回傳（長度上限已足夠）。
  return clipText(value, 32);
};

const toInt = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const parseJsonValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(value)) return parseJsonValue(value.toString("utf8"));
  return value;
};

// ---------------------------------------------------------------------------------------------
// 各彙總
// ---------------------------------------------------------------------------------------------

interface ReportOptions {
  days: number;
  limit: number;
  /**
   * 「目前真的在跑」的 feed_code 清單（由呼叫者注入，例如 route.ts 組好 RSS_FEEDS ＋
   * special source 代碼後傳入；測試用假清單）。news-feed-stats 用它排除已退役、
   * 不在清單內的 feed_code，不必在這個刻意不 import 任何模組的檔案裡自己維護一份
   * 「已退役清單」。不傳（null）就不過濾，維持舊行為。
   */
  activeFeedCodes: ReadonlySet<string> | null;
}

interface ReportDefinition {
  description: string;
  /** 這個彙總接受的額外參數；其他一律 400。 */
  params: ReadonlyArray<"days" | "limit">;
  run: (query: DiagnosticsQuery, options: ReportOptions) => Promise<Record<string, unknown>>;
}

interface FeedAccumulator {
  feed: string;
  ok: number;
  failed: number;
  lastOkAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
  lastHttpStatus: number | null;
}

const newsFeedStats = async (query: DiagnosticsQuery, { days, activeFeedCodes }: ReportOptions): Promise<Record<string, unknown>> => {
  const feeds = new Map<string, FeedAccumulator>();
  let runsScanned = 0;
  let lastId = Number.MAX_SAFE_INTEGER;

  while (runsScanned < FEED_RUNS_SCAN_MAX) {
    const runs = await query(
      `SELECT id, started_at, summary_json
       FROM ingest_runs
       WHERE id < ?
         AND started_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
         AND status IN ('success', 'failed')
         AND summary_json IS NOT NULL
       ORDER BY id DESC
       LIMIT ${FEED_RUNS_PAGE}`,
      [lastId, days],
    );
    if (runs.length === 0) break;
    for (const run of runs) {
      runsScanned += 1;
      const id = toInt(run.id);
      if (id !== null) lastId = Math.min(lastId, id);
      const summary = parseJsonValue(run.summary_json) as { feedResults?: unknown } | null;
      const results = summary && Array.isArray(summary.feedResults) ? summary.feedResults : [];
      const at = toIso(run.started_at);
      for (const raw of results) {
        const item = raw as { feed?: { code?: unknown }; ok?: unknown; httpStatus?: unknown; errorMessage?: unknown } | null;
        const code = clipText(item?.feed?.code, 64);
        if (!item || !code) continue;
        let acc = feeds.get(code);
        if (!acc) {
          acc = { feed: code, ok: 0, failed: 0, lastOkAt: null, lastFailedAt: null, lastError: null, lastHttpStatus: null };
          feeds.set(code, acc);
        }
        // 由新到舊走訪：第一次遇到的就是「最近一次」。
        if (item.ok) {
          acc.ok += 1;
          if (acc.lastOkAt === null) acc.lastOkAt = at;
        } else {
          acc.failed += 1;
          if (acc.lastFailedAt === null) {
            acc.lastFailedAt = at;
            acc.lastError = clipText(item.errorMessage, SHORT_TEXT);
            acc.lastHttpStatus = toInt(item.httpStatus);
          }
        }
      }
    }
    if (runs.length < FEED_RUNS_PAGE) break;
  }

  const errorRows = await query(
    `SELECT feed_code, COUNT(*) AS error_rows
     FROM ingest_errors
     WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY) AND feed_code IS NOT NULL
     GROUP BY feed_code
     ORDER BY error_rows DESC
     LIMIT ${FEED_ROWS_MAX}`,
    [days],
  );

  // 退役的 feed_code（例如 #705 下架的 tase_news、commonhealth_club_new）在統計窗口內
  // 可能還留著下架前的失敗紀錄，混在現行來源裡會誤導判讀。activeFeedCodes 非 null 時，
  // 只保留清單內的 feed_code；排除掉的相異代碼數量回報在 excludedFeedCodes，方便確認
  // 排除有沒有生效，而不必列出名稱。
  const isActive = (code: string): boolean => activeFeedCodes === null || activeFeedCodes.has(code);
  const excludedCodes = new Set<string>();
  if (activeFeedCodes !== null) {
    for (const code of feeds.keys()) if (!isActive(code)) excludedCodes.add(code);
    for (const row of errorRows) {
      const code = clipText(row.feed_code, 64);
      if (code !== null && !isActive(code)) excludedCodes.add(code);
    }
  }

  const sorted = [...feeds.values()]
    .filter((f) => isActive(f.feed))
    .sort((a, b) => b.failed - a.failed || a.feed.localeCompare(b.feed))
    .slice(0, FEED_ROWS_MAX)
    .map((f) => ({
      feed: f.feed,
      ok: f.ok,
      failed: f.failed,
      lastOkAt: f.lastOkAt,
      lastFailedAt: f.lastFailedAt,
      lastHttpStatus: f.lastHttpStatus,
      lastError: f.lastError,
    }));

  return {
    days,
    runsScanned,
    feeds: sorted,
    excludedFeedCodes: activeFeedCodes === null ? null : excludedCodes.size,
    ingestErrorRows: errorRows
      .map((r) => ({ feedCode: clipText(r.feed_code, 64), count: toInt(r.error_rows) }))
      .filter((r) => r.feedCode === null || isActive(r.feedCode)),
  };
};

const columnWidths = async (query: DiagnosticsQuery): Promise<Record<string, unknown>> => {
  const tables = [...new Set(COLUMN_WIDTH_TARGETS.map(([t]) => t))];
  const columns = [...new Set(COLUMN_WIDTH_TARGETS.map(([, c]) => c))];
  const rows = await query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type,
            CHARACTER_MAXIMUM_LENGTH AS max_length, IS_NULLABLE AS is_nullable
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${tables.map(() => "?").join(", ")})
       AND COLUMN_NAME IN (${columns.map(() => "?").join(", ")})`,
    [...tables, ...columns],
  );
  const found = new Map<string, Record<string, unknown>>();
  for (const r of rows) found.set(`${String(r.table_name)}.${String(r.column_name)}`, r);
  return {
    columns: COLUMN_WIDTH_TARGETS.map(([table, column]) => {
      const r = found.get(`${table}.${column}`);
      return {
        table,
        column,
        exists: Boolean(r),
        type: r ? clipText(r.column_type, 40) : null,
        maxLength: r ? toInt(r.max_length) : null,
        nullable: r ? String(r.is_nullable).toUpperCase() === "YES" : null,
      };
    }),
  };
};

const tableRowCounts = async (query: DiagnosticsQuery): Promise<Record<string, unknown>> => {
  const tables: Array<{ table: string; rows: number | null }> = [];
  for (const table of ROW_COUNT_TABLES) {
    try {
      // 表名只來自上面的常數白名單，不來自任何請求輸入。
      const rows = await query(`SELECT COUNT(*) AS n FROM \`${table}\``);
      tables.push({ table, rows: toInt(rows[0]?.n) });
    } catch {
      tables.push({ table, rows: null });
    }
  }
  return { tables };
};

const scheduleLatestRuns = async (query: DiagnosticsQuery): Promise<Record<string, unknown>> => {
  const rows = await query(
    `SELECT r.trigger_type, r.status, r.started_at, r.ended_at, r.duration_ms, r.failed_feeds_count, r.error_message
     FROM ingest_runs r
     JOIN (SELECT trigger_type, MAX(id) AS max_id FROM ingest_runs GROUP BY trigger_type) m ON r.id = m.max_id
     ORDER BY r.started_at DESC
     LIMIT ${LATEST_RUN_ROWS_MAX}`,
  );
  return {
    latestRunPerTrigger: rows.map((r) => ({
      trigger: clipText(r.trigger_type, 50),
      status: clipText(r.status, 20),
      startedAt: toIso(r.started_at),
      endedAt: toIso(r.ended_at),
      durationMs: toInt(r.duration_ms),
      failedFeeds: toInt(r.failed_feeds_count),
      error: clipText(r.error_message, SHORT_TEXT),
    })),
  };
};

const typhoonAlertSample = async (query: DiagnosticsQuery, { limit }: ReportOptions): Promise<Record<string, unknown>> => {
  const total = await query(`SELECT COUNT(*) AS n FROM cwa_alerts WHERE dataset_id = ?`, [TYPHOON_DATASET_ID]);
  const rows = await query(
    `SELECT event, headline, effective, expires
     FROM cwa_alerts
     WHERE dataset_id = ?
     ORDER BY effective DESC, id DESC
     LIMIT ?`,
    [TYPHOON_DATASET_ID, limit],
  );
  return {
    datasetId: TYPHOON_DATASET_ID,
    totalRows: toInt(total[0]?.n) ?? 0,
    limit,
    returned: rows.length,
    rows: rows.slice(0, limit).map((r) => ({
      event: clipText(r.event, EVENT_MAX_CHARS),
      headline: clipText(r.headline, HEADLINE_MAX_CHARS),
      effective: toIso(r.effective),
      expires: toIso(r.expires),
    })),
  };
};

export const REPORTS: Readonly<Record<string, ReportDefinition>> = {
  "news-feed-stats": {
    description: "每個新聞來源在最近 days 天（1-14，預設 3）的成功／失敗次數、最近成功時間、最近一次錯誤（截斷）；已自動排除不在現行來源清單內（已退役）的 feed_code",
    params: ["days"],
    run: newsFeedStats,
  },
  "column-widths": {
    description: "白名單內幾個表的指定欄位型別與寬度（例如 news_items.feed_code）",
    params: [],
    run: (query) => columnWidths(query),
  },
  "table-row-counts": {
    description: "白名單內資料表的列數",
    params: [],
    run: (query) => tableRowCounts(query),
  },
  "schedule-latest-runs": {
    description: "每種 trigger_type 最近一次 ingest_runs 的狀態、時間、耗時與（截斷的）錯誤",
    params: [],
    run: (query) => scheduleLatestRuns(query),
  },
  "typhoon-alert-sample": {
    description: `cwa_alerts 中 ${TYPHOON_DATASET_ID} 最近 limit 筆（1-20，預設 5）的 event、headline（截斷 ${HEADLINE_MAX_CHARS} 字元）、effective、expires 與列數`,
    params: ["limit"],
    run: typhoonAlertSample,
  },
};

export const REPORT_NAMES: ReadonlyArray<string> = Object.keys(REPORTS);

// ---------------------------------------------------------------------------------------------
// 請求處理
// ---------------------------------------------------------------------------------------------

const badRequest = (error: string): DiagnosticsResult => ({ status: 400, body: { ok: false, error, reports: REPORT_NAMES } });

const parseBoundedInt = (raw: string, min: number, max: number): number | null => {
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
};

export interface HandleDiagnosticsParams {
  /** 呼叫者是否已通過管理員金鑰驗證（由路由用 requireAdminSecret 判斷）。 */
  authorized: boolean;
  searchParams: URLSearchParams;
  query: DiagnosticsQuery;
  /** 一行日誌（誰、何種彙總、耗時）；不傳則不記。 */
  log?: (line: string) => void;
  /** 呼叫者識別（例如 IP），只進日誌，不進回應。 */
  caller?: string;
  now?: () => number;
  /**
   * 「目前真的在跑」的 feed_code 清單，news-feed-stats 用來排除已退役的 feed_code（見
   * ReportOptions.activeFeedCodes）。由路由組好真正的清單傳入（RSS_FEEDS ＋ special
   * source 代碼，見 lib/server/config/），測試可以傳假清單；不傳就不過濾。
   */
  activeFeedCodes?: ReadonlyArray<string>;
}

export const handleDiagnosticsRequest = async (params: HandleDiagnosticsParams): Promise<DiagnosticsResult> => {
  const now = params.now ?? Date.now;
  const started = now();
  const caller = clipText(params.caller ?? "unknown", 45) ?? "unknown";
  const logLine = (report: string, status: number): void => {
    params.log?.(`[admin-diagnostics] caller=${caller} report=${report} status=${status} ms=${now() - started}`);
  };

  if (!params.authorized) {
    logLine("-", 401);
    return { status: 401, body: { ok: false, error: "Unauthorized" } };
  }

  const result = await run(params);
  logLine(typeof result.body.report === "string" ? result.body.report : "-", result.status);
  return result;
};

const run = async ({ searchParams, query, now = Date.now, activeFeedCodes }: HandleDiagnosticsParams): Promise<DiagnosticsResult> => {
  const started = now();
  const keys = [...searchParams.keys()];
  const reportName = searchParams.get("report");

  if (reportName === null) {
    if (keys.length > 0) return badRequest("unknown parameter");
    return {
      status: 200,
      body: {
        ok: true,
        reports: Object.entries(REPORTS).map(([name, def]) => ({ name, description: def.description, params: def.params })),
      },
    };
  }

  // 用 Object.hasOwn 而不是 `in`，避免 "constructor"、"__proto__" 之類的名稱溜過白名單。
  if (!Object.hasOwn(REPORTS, reportName)) return badRequest("unknown report");
  const definition = REPORTS[reportName];

  const allowed = new Set<string>(["report", ...definition.params]);
  if (keys.some((k) => !allowed.has(k)) || new Set(keys).size !== keys.length) return badRequest("unknown parameter");

  const options: ReportOptions = {
    days: FEED_DAYS_DEFAULT,
    limit: TYPHOON_LIMIT_DEFAULT,
    activeFeedCodes: activeFeedCodes ? new Set(activeFeedCodes) : null,
  };
  const rawDays = searchParams.get("days");
  if (rawDays !== null) {
    const days = parseBoundedInt(rawDays, 1, FEED_DAYS_MAX);
    if (days === null) return badRequest(`days must be an integer 1-${FEED_DAYS_MAX}`);
    options.days = days;
  }
  const rawLimit = searchParams.get("limit");
  if (rawLimit !== null) {
    const limit = parseBoundedInt(rawLimit, 1, TYPHOON_LIMIT_MAX);
    if (limit === null) return badRequest(`limit must be an integer 1-${TYPHOON_LIMIT_MAX}`);
    options.limit = limit;
  }

  let data: Record<string, unknown>;
  try {
    data = await definition.run(query, options);
  } catch (error) {
    // 只回固定字串；資料庫錯誤內容可能帶連線資訊，不回傳。
    return { status: 500, body: { ok: false, report: reportName, error: "report failed", errorName: error instanceof Error ? clipText(error.name, 40) : null } };
  }

  const body = { ok: true, report: reportName, generatedAt: new Date(now()).toISOString(), durationMs: now() - started, data };
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_RESPONSE_BYTES) {
    return { status: 500, body: { ok: false, report: reportName, error: "response too large" } };
  }
  return { status: 200, body };
};
