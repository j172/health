/**
 * issue #739：news_items.feed_code 與 ingest_errors.feed_code 原本定義為 VARCHAR(10)，
 * 但實際來源代碼最長 22 字元（mirrormedia_healthnews），50 多個超過 10 字元。正式站是非嚴格 SQL 模式，
 * 超長的值不報錯、被「靜默截斷」成前 10 個字元（thenewslens_health／_lifestyle／_elderly 都變成
 * `thenewslen`），所以問題一直沒浮出來。
 *
 * 寬度選 63 而不是 64：utf8mb4 一個字元最多 4 bytes，63×4 = 252 ≤ 255，VARCHAR 的長度前綴仍是
 * 1 個 byte；64×4 = 256 > 255 要用 2 個 byte，InnoDB 就不能原地（INPLACE）擴充、會整表重建
 * （news_items 是大表、重建期間會鎖住寫入）。10 → 63 兩者都是 1 個長度 byte，可以原地擴充。
 *
 * 這個檔案刻意不 import 任何東西（不用 "@/..." 別名），讓 node --test 可以直接載入行為測試。
 */
export const FEED_CODE_COLUMN_LENGTH = 63;

/** 受影響的欄位（news_items.feed_code 是 NOT NULL；ingest_errors.feed_code 可為 NULL）。 */
export const FEED_CODE_COLUMNS: ReadonlyArray<{ table: string; column: string; nullable: boolean }> = [
  { table: "news_items", column: "feed_code", nullable: false },
  { table: "ingest_errors", column: "feed_code", nullable: true },
];

/** mysql2 Pool.query 的最小介面（回傳 [rows, fields]），讓測試可以用假物件驅動。 */
export interface SchemaQueryable {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

export interface FeedCodeWidenResult {
  /** 這次實際放寬的欄位。 */
  widened: string[];
  /** 已經夠寬或表／欄位不存在，沒有動作。 */
  unchanged: string[];
  /** 查詢或 ALTER 失敗的欄位（只記警告，不丟例外）。 */
  failed: string[];
}

/**
 * 冪等地把 FEED_CODE_COLUMNS 放寬到 FEED_CODE_COLUMN_LENGTH。
 * - 先查 information_schema，目前寬度已 ≥ 63（含人工調整過）就完全不動作。
 * - 只用 `ALGORITHM=INPLACE, LOCK=NONE`：若這台資料庫無法原地擴充就讓 ALTER 報錯，只記警告、
 *   不退回會鎖表重建的 COPY（啟動時不該卡住）；改由維運手動處理（見 PR 說明）。
 * - 任何失敗都只 console.warn，不丟例外，不讓 schema 初始化（啟動）失敗。
 * - 索引（uq_news_external、idx_news_feed_published）會跟著欄位一起原地擴充；
 *   最長索引鍵 uq_news_external = 50×4 + 63×4 + 100×4 = 852 bytes，遠低於 InnoDB 的 3072 bytes 上限。
 */
export const widenFeedCodeColumns = async (
  db: SchemaQueryable,
  warn: (message: string, error?: unknown) => void = (message, error) => console.warn(message, error),
): Promise<FeedCodeWidenResult> => {
  const result: FeedCodeWidenResult = { widened: [], unchanged: [], failed: [] };
  for (const { table, column, nullable } of FEED_CODE_COLUMNS) {
    const label = `${table}.${column}`;
    try {
      const response = await db.query(
        `SELECT CHARACTER_MAXIMUM_LENGTH AS max_length
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
         LIMIT 1`,
        [table, column],
      );
      const rows = Array.isArray(response) ? (response[0] as Array<{ max_length?: unknown }> | undefined) : undefined;
      const current = rows && rows.length > 0 ? Number(rows[0].max_length) : null;
      if (current === null || !Number.isFinite(current) || current >= FEED_CODE_COLUMN_LENGTH) {
        result.unchanged.push(label);
        continue;
      }
      await db.query(
        `ALTER TABLE \`${table}\`
           MODIFY COLUMN \`${column}\` VARCHAR(${FEED_CODE_COLUMN_LENGTH}) ${nullable ? "NULL" : "NOT NULL"},
           ALGORITHM=INPLACE, LOCK=NONE`,
      );
      result.widened.push(label);
    } catch (err) {
      result.failed.push(label);
      warn(`[ensureSchema] widening ${label} to VARCHAR(${FEED_CODE_COLUMN_LENGTH}) warning:`, err);
    }
  }
  return result;
};
