/**
 * /api/typhoon-status 的 Cache-Control 值（issue #744）。
 * 放在這裡而不是 route.ts：Next.js 的 route 檔不允許匯出 GET 等以外的欄位，
 * 而測試需要直接引用這些常數。
 *
 * 沒有 Cache-Control 的 /api/* 會被上游補上預設 30 分鐘，所以每個分支都必須顯式宣告。
 */

/** 正常（含「沒有警報」）：Cloudflare 快取 60 秒，過期後 120 秒內可先回舊值並背景更新。 */
export const TYPHOON_STATUS_CACHE_NORMAL = "public, s-maxage=60, stale-while-revalidate=120";

/** 資料庫讀不到而回 active:false：只快取 10 秒，恢復後馬上能顯示。 */
export const TYPHOON_STATUS_CACHE_DB_UNAVAILABLE = "public, max-age=0, s-maxage=10";

/** 模擬（金鑰正確的測試請求）：任何快取都不得保留。 */
export const TYPHOON_STATUS_CACHE_SIMULATED = "no-store";
