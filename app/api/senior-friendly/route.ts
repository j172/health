import { NextRequest, NextResponse } from "next/server";
import { cacheInit } from "@/lib/server/http/cacheControl";
import { getSeniorCardOverview } from "@/lib/server/seniorCard/queries";

export const runtime = "nodejs";

// issue #729：樂齡旅遊（tourismFacilities／tourismServices／tourPackages／tourismAlerts 四個欄位）
// 已整個移除，回應只剩敬老卡補助（seniorCards、counties）；seniorCards 的形狀不變。
// 舊的 `query` 參數原本只用來搜尋景區與服務，現在被忽略。
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get("county") || undefined;

    const data = await getSeniorCardOverview({ county });

    return NextResponse.json({
      ok: true,
      ...data,
      updatedAt: new Date().toISOString(),
    }, cacheInit("medium"));
  } catch (error) {
    console.error("Error in /api/senior-friendly:", error);
    return NextResponse.json(
      { ok: false, error: "無法取得敬老卡補助資訊" },
      { status: 500 },
    );
  }
}
