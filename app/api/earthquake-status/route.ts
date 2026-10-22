import { NextResponse } from "next/server";
import { loadEarthquakeStatus } from "@/lib/server/earthquake/status";
import {
  EARTHQUAKE_STATUS_CACHE_DB_UNAVAILABLE,
  EARTHQUAKE_STATUS_CACHE_NORMAL,
} from "@/lib/server/earthquake/cacheControl";
import { INACTIVE_EARTHQUAKE_STATUS, type EarthquakeStatus } from "@/lib/earthquake/earthquakeStatus";

export const runtime = "nodejs";
// Never statically rendered by Next itself: the status is read per request
// (60-second in-process memo + the explicit headers below).
export const dynamic = "force-dynamic";

/**
 * 地震速報橫幅狀態端點。比照 app/api/typhoon-status/route.ts（issue #744）。回應：
 *   { active: boolean, magnitude?: number, maxIntensity?: string, location?: string, originTime?: string }
 *
 * 全站橫幅是「客戶端元件」，載入後才向這裡取得狀態，所以頁面 HTML（新聞單篇頁等由
 * Cloudflare 快取 60 秒者）完全不含地震內容。
 *
 * 快取標頭必須顯式宣告：沒有 Cache-Control 的 /api/* 會被上游補上預設 30 分鐘。
 *  - 正常（含「沒有有感地震」）：public, max-age=0, s-maxage=60, stale-while-revalidate=120
 *  - 資料庫讀不到：回 active:false，但只快取 10 秒，恢復後馬上能顯示（不讓「讀不到」被當成「沒地震」久存）
 * 狀態碼一律 200：橫幅在 fetch 失敗時本來就不顯示，端點不需要用錯誤碼表達資料庫失敗。
 */
const json = (body: EarthquakeStatus, cacheControl: string): NextResponse =>
  NextResponse.json(body, { headers: { "Cache-Control": cacheControl } });

export async function GET(): Promise<NextResponse> {
  const status = await loadEarthquakeStatus();
  if (status === null) return json({ ...INACTIVE_EARTHQUAKE_STATUS }, EARTHQUAKE_STATUS_CACHE_DB_UNAVAILABLE);
  return json(status, EARTHQUAKE_STATUS_CACHE_NORMAL);
}
