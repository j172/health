import fs from "node:fs";
import path from "node:path";

/**
 * 「按需讀取、短暫停留」的種子 JSON 讀取器（#709）。
 *
 * 為什麼存在：Next 預設開機就把全部路由模組載入（`preloadEntriesOnStart`），
 * 所以任何 `import x from "@/data/foo.json"` 都會讓整份 JSON 的原始碼文字
 * 在每個 server 行程裡永久常駐（中文字串每字 2 bytes），而且解析後的物件
 * 還會被模組快取留到行程結束。health-web 在 1 GB 實體記憶體上限的帳號裡
 * 被外部 SIGKILL，這些「幾乎用不到」的大型種子（多半只在資料庫沒資料時才
 * 當後備）就是可以拿掉的常駐量。見 docs/specs/memory-attribution-709.md。
 *
 * 行為：
 * - 第一次需要時才讀檔＋解析；之後在 `ttlMs`（預設 60 秒）內共用同一份物件，
 *   避免同一波請求重複解析。逾時由 `unref()` 的計時器移除參照，物件即可被
 *   GC 回收，行程閒置時不會因為這個計時器而無法結束。
 * - TTL 是「從載入時起算的絕對時間」，不會因為持續有請求而一直續命；所以
 *   常駐上限固定為 TTL，最壞情況是每個 TTL 週期多解析一次（幾十毫秒）。
 * - 呼叫端必須把回傳值當唯讀（和原本靜態 import 的共用物件一樣）。
 *
 * 路徑（全站唯一的種子讀取順序，#741）：先找 `public/data/`、再找 `data/`（相對於
 * `process.cwd()`）。正式站的部署（deploy-ftps.yml 的 `cp -r data/* public/data/`＋
 * `.remote-health-index.php` 解壓到 `~/health_app/public`）每次都會覆寫
 * `public/data/`；而 `~/health_app/data` 只有在不存在時才會被建成指向
 * `public/data` 的符號連結，已是實體資料夾時只做 `cp -rn`（不覆寫既有檔），
 * 可能是舊版。所以優先 `public/data/`，永遠拿到最新部署的內容；找不到才退到
 * `data/`（本機開發、測試，以及 `public/data/` 不存在的環境）。
 *
 * 這個檔案同時是 repo 內所有「執行期讀種子檔」的唯一入口：
 * - `readTransientSeedJson()`：有 TTL 快取，給大型種子（#709）。
 * - `readSeedJson()`／`readSeedText()`：不快取，給頁面、一次性匯入與較小的檔案。
 * 三者共用同一個 `loadSeedFile()` 與同一份 `TRANSIENT_SEED_DIRS`，不要在別處再手寫
 * `path.join(process.cwd(), "data", ...)`（tests/seed-read-order-741.test.mjs 會擋）。
 * 寫入種子（例如 nhiPenalties 的離線備份、scripts/ 的產生器）不在此限，仍寫 `data/`。
 *
 * 找不到檔或解析失敗時回傳 `null` 並寫一行警告（同一檔每分鐘最多一行），
 * 由呼叫端決定降級行為。**只能傳入寫死的檔名，不要把使用者輸入帶進來。**
 */

export const DEFAULT_TRANSIENT_SEED_TTL_MS = 60_000;

/** 依序嘗試的資料夾（相對於 cwd）。 */
export const TRANSIENT_SEED_DIRS: readonly (readonly string[])[] = [
  ["public", "data"],
  ["data"],
];

export interface TransientSeedOptions {
  /** 解析結果在記憶體中的停留時間（毫秒），預設 60 秒。 */
  ttlMs?: number;
}

interface CacheEntry {
  value: unknown;
  timer: ReturnType<typeof setTimeout>;
}

const cache = new Map<string, CacheEntry>();
const lastWarnAt = new Map<string, number>();
const WARN_INTERVAL_MS = 60_000;

function warnOnce(key: string, message: string): void {
  const now = Date.now();
  const last = lastWarnAt.get(key);
  if (last !== undefined && now - last < WARN_INTERVAL_MS) return;
  lastWarnAt.set(key, now);
  console.warn(message);
}

/** 回傳會嘗試的絕對路徑（測試與日誌用）。 */
export function transientSeedCandidates(filename: string): string[] {
  return TRANSIENT_SEED_DIRS.map((dir) =>
    path.join(/*turbopackIgnore: true*/ process.cwd(), ...dir, filename),
  );
}

export type SeedLoadResult<T> =
  | { found: true; value: T; path: string }
  | { found: false; sawFile: boolean; error: unknown; candidates: string[] };

/**
 * 依 `TRANSIENT_SEED_DIRS` 的順序找第一個「讀得到且 `parse` 成功」的檔案。
 * 前面的檔案不存在、讀不到或 `parse` 丟例外時，會退到下一個位置。
 */
export function loadSeedFile<T>(filename: string, parse: (text: string) => T): SeedLoadResult<T> {
  const candidates = transientSeedCandidates(filename);
  let lastError: unknown = null;
  let sawFile = false;

  for (const candidate of candidates) {
    let text: string;
    try {
      text = fs.readFileSync(candidate, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        sawFile = true;
        lastError = error;
      }
      continue;
    }
    sawFile = true;
    try {
      return { found: true, value: parse(text), path: candidate };
    } catch (error) {
      lastError = error;
    }
  }
  return { found: false, sawFile, error: lastError, candidates };
}

export interface SeedReadOptions {
  /**
   * 這個檔本來就可能不存在（例如依網址參數猜的種子名）。為 true 時「找不到檔」
   * 不寫警告；檔案存在但壞掉仍會警告。
   */
  optional?: boolean;
}

function reportSeedUnavailable(
  key: string,
  filename: string,
  result: Extract<SeedLoadResult<unknown>, { found: false }>,
  options: SeedReadOptions = {},
): void {
  if (!result.sawFile) {
    if (options.optional) return;
    warnOnce(
      key,
      `[seed] 找不到種子檔 ${filename}（已嘗試：${result.candidates.join("、")}），該功能降級為無資料。`,
    );
  } else {
    warnOnce(
      key,
      `[seed] 無法讀取或解析種子檔 ${filename}：${result.error instanceof Error ? result.error.message : String(result.error)}，該功能降級為無資料。`,
    );
  }
}

/**
 * 不快取的讀取（每次都讀檔＋解析）。給頁面（本身有 ISR）、一次性匯入與小檔案用；
 * 順序與日誌規則和 `readTransientSeedJson` 完全相同。找不到或壞掉回傳 `null`。
 */
export function readSeedJson<T = unknown>(filename: string, options: SeedReadOptions = {}): T | null {
  const result = loadSeedFile<T>(filename, (text) => JSON.parse(text) as T);
  if (result.found) return result.value;
  reportSeedUnavailable(`${process.cwd()}|${filename}`, filename, result, options);
  return null;
}

/** 同 `readSeedJson`，但回傳原始文字（CSV 等）。空白內容視為「沒有這個檔」並退到下一個位置。 */
export function readSeedText(filename: string, options: SeedReadOptions = {}): string | null {
  const result = loadSeedFile<string>(filename, (text) => {
    if (text.trim().length === 0) throw new Error("檔案內容是空的");
    return text;
  });
  if (result.found) return result.value;
  reportSeedUnavailable(`${process.cwd()}|${filename}`, filename, result, options);
  return null;
}

export function readTransientSeedJson<T = unknown>(
  filename: string,
  options: TransientSeedOptions = {},
): T | null {
  const cwd = process.cwd();
  const key = `${cwd}|${filename}`;
  const hit = cache.get(key);
  if (hit) return hit.value as T;

  const ttlMs = options.ttlMs ?? DEFAULT_TRANSIENT_SEED_TTL_MS;
  const result = loadSeedFile<unknown>(filename, (text) => JSON.parse(text));
  if (!result.found) {
    reportSeedUnavailable(key, filename, result);
    return null;
  }

  const entry: CacheEntry = {
    value: result.value,
    timer: setTimeout(() => {
      // 只移除自己；期間若被 clear 後重新載入，不要誤刪新的那份。
      if (cache.get(key) === entry) cache.delete(key);
    }, ttlMs),
  };
  entry.timer.unref?.();
  cache.set(key, entry);
  return result.value as T;
}

/** 目前還留在記憶體中的種子數（測試與診斷用）。 */
export function transientSeedCacheSize(): number {
  return cache.size;
}

/** 立刻釋放全部參照（測試用；正式程式碼不需要呼叫）。 */
export function clearTransientSeedCache(): void {
  for (const entry of cache.values()) clearTimeout(entry.timer);
  cache.clear();
  lastWarnAt.clear();
}
