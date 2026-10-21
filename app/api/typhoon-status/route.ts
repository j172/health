import { NextRequest, NextResponse } from "next/server";
import { loadTyphoonStatus } from "@/lib/server/typhoon/status";
import { buildSimulatedStatus, resolveSimulatedLevel, SIM_KEY_HEADER } from "@/lib/server/typhoon/simulation";
import {
  TYPHOON_STATUS_CACHE_DB_UNAVAILABLE,
  TYPHOON_STATUS_CACHE_NORMAL,
  TYPHOON_STATUS_CACHE_SIMULATED,
} from "@/lib/server/typhoon/cacheControl";
import { INACTIVE_TYPHOON_STATUS, type TyphoonStatus } from "@/lib/typhoon/typhoonStatus";

export const runtime = "nodejs";
// Never statically rendered by Next itself: the status is read per request
// (60-second in-process memo + the explicit headers below).
export const dynamic = "force-dynamic";

/**
 * 颱風警報狀態端點（issue #744）。回應：
 *   { active: boolean, level: "land" | "sea" | null, name?: string, issuedAt?: string, simulated?: true }
 *
 * 全站橫幅與首頁卡片是「客戶端元件」，載入後才向這裡取得狀態，所以頁面 HTML（新聞單篇頁等
 * 由 Cloudflare 快取 60 秒者）完全不含警報內容。
 *
 * 快取標頭必須顯式宣告：沒有 Cache-Control 的 /api/* 會被上游補上預設 30 分鐘。
 *  - 正常（含「沒有警報」）：public, max-age=0, s-maxage=60, stale-while-revalidate=120
 *  - 資料庫讀不到：回 active:false，但只快取 10 秒，恢復後馬上能顯示（不讓「讀不到」被當成「沒警報」久存）
 *  - 模擬（金鑰正確的測試請求）：no-store
 * 狀態碼一律 200：橫幅在 fetch 失敗時本來就不顯示，端點不需要用錯誤碼表達資料庫失敗。
 */
const json = (body: TyphoonStatus, cacheControl: string): NextResponse =>
  NextResponse.json(body, { headers: { "Cache-Control": cacheControl } });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const simulatedLevel = resolveSimulatedLevel(
    request.nextUrl.searchParams.get("sim"),
    request.headers.get(SIM_KEY_HEADER),
    process.env.TYPHOON_SIM_KEY,
  );
  if (simulatedLevel) return json(buildSimulatedStatus(simulatedLevel), TYPHOON_STATUS_CACHE_SIMULATED);

  const status = await loadTyphoonStatus();
  if (status === null) return json({ ...INACTIVE_TYPHOON_STATUS }, TYPHOON_STATUS_CACHE_DB_UNAVAILABLE);
  return json(status, TYPHOON_STATUS_CACHE_NORMAL);
}
