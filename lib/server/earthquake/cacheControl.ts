/**
 * /api/earthquake-status 的 Cache-Control 值。比照 lib/server/typhoon/cacheControl.ts
 * （issue #744）：放在這裡而不是 route.ts，因為 Next.js 的 route 檔不允許匯出 GET 等以外的
 * 欄位，而測試需要直接引用這些常數。
 *
 * 沒有 Cache-Control 的 /api/* 會被上游補上預設 30 分鐘，所以每個分支都必須顯式宣告。
 */

/** 正常（含「沒有有感地震」）：瀏覽器不留存（max-age=0，否則 Cloudflare 會補上 30 分鐘）、Cloudflare 快取 60 秒，過期後 120 秒內可先回舊值並背景更新。 */
export const EARTHQUAKE_STATUS_CACHE_NORMAL = "public, max-age=0, s-maxage=60, stale-while-revalidate=120";

/** 資料庫讀不到而回 active:false：只快取 10 秒，恢復後馬上能顯示。 */
export const EARTHQUAKE_STATUS_CACHE_DB_UNAVAILABLE = "public, max-age=0, s-maxage=10";
