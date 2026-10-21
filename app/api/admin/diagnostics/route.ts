import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { withConnection } from "@/lib/server/db/mysql";
import { handleDiagnosticsRequest, type DiagnosticsQuery } from "@/lib/server/ops/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUERY_TIMEOUT_MS = 10_000;

/**
 * GET /api/admin/diagnostics                      列出可用的彙總（不查資料庫）
 * GET /api/admin/diagnostics?report=<name>        執行白名單內的一種唯讀彙總
 *   &days=1-14   只給 news-feed-stats
 *   &limit=1-20  只給 typhoon-alert-sample
 *
 * 與其他 /api/admin/* 一樣用 x-rss-sync-admin-secret 標頭驗證。白名單、參數驗證與輸出整形都在
 * lib/server/ops/diagnostics.ts（issue #738）；這裡只負責驗證金鑰、接上資料庫連線與一行日誌。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  const caller = (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const searchParams = new URL(request.url).searchParams;

  const query: DiagnosticsQuery = async (sql, params) =>
    withConnection(async (conn) => {
      const [rows] = await conn.query({ sql, timeout: QUERY_TIMEOUT_MS }, params ? [...params] : []);
      return rows as Array<Record<string, unknown>>;
    });

  const result = await handleDiagnosticsRequest({
    authorized: denied === null,
    searchParams,
    caller,
    log: (line) => console.log(line),
    query,
  });

  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
