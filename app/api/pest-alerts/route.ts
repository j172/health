import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * issue #788：作物病蟲害即時預警功能已整個移除（頁面、資料表、每 6 小時的同步排程）。這個端點只留一個
 * 410 Gone，讓仍在呼叫它的外部程式／爬蟲明確知道「這個網址永久消失」，而不是 404（可能只是暫時找不到）。
 *
 * 不碰資料庫、不 import 任何病蟲害預警程式碼。Cache-Control 顯式宣告：
 * /api/* 沒有自己的標頭時會被上游補一個 30 分鐘的預設值，410 本身不會變，
 * 讓瀏覽器 1 小時、共用快取 1 天即可。
 */
export function GET() {
  return NextResponse.json(
    { ok: false, error: "作物病蟲害即時預警功能已於 2026-10 移除，此端點不再提供資料" },
    { status: 410, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
