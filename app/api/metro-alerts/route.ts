import { NextRequest, NextResponse } from "next/server";
import { getMetroAlerts } from "@/lib/server/metroAlerts/queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lineName = searchParams.get("line") || undefined;
  const stationName = searchParams.get("station") || undefined;
  const alertType = searchParams.get("type") || undefined;
  const limitStr = searchParams.get("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  try {
    const alerts = await getMetroAlerts({ lineName, stationName, alertType, limit });
    return NextResponse.json({ ok: true, count: alerts.length, alerts });
  } catch (error) {
    console.error("Error in /api/metro-alerts:", error);
    return NextResponse.json({ ok: false, error: "無法取得捷運即時公告" }, { status: 500 });
  }
}
