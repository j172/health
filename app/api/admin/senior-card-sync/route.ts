import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runSeniorCardSync } from "@/lib/server/seniorCard/runSync";

export const runtime = "nodejs";

/**
 * 管理員手動觸發 22 縣市敬老卡補助的 TDX 同步（issue #729 起敬老卡為靜態資料，
 * 已沒有排程；需要更新時才手動呼叫，約 22 個 TDX 請求）。
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const seniorCard = await runSeniorCardSync();
  return NextResponse.json({ ok: seniorCard.ok, seniorCard }, { status: seniorCard.ok ? 200 : 500 });
}
