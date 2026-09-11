import { NextRequest, NextResponse } from "next/server";
import { getPestAlerts } from "@/lib/server/pestAlerts/queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get("keyword") || undefined;
  const warningLevel = searchParams.get("level") || undefined;
  const limitStr = searchParams.get("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  try {
    const alerts = await getPestAlerts({ keyword, warningLevel, limit });
    return NextResponse.json({ ok: true, count: alerts.length, alerts });
  } catch (error) {
    console.error("Error in /api/pest-alerts:", error);
    return NextResponse.json({ ok: false, error: "無法取得作物病蟲害示警資料" }, { status: 500 });
  }
}
