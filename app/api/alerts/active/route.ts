import { NextRequest, NextResponse } from "next/server";
import { getActiveNcdrAlerts } from "@/lib/server/ncdr/ncdrAlerts";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const county = searchParams.get("county") || undefined;
  const category = searchParams.get("category") || undefined;

  try {
    const alerts = await getActiveNcdrAlerts({ county, category });
    return NextResponse.json({
      ok: true,
      count: alerts.length,
      alerts,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /api/alerts/active:", error);
    return NextResponse.json(
      { ok: false, error: "無法取得即時災防示警資料" },
      { status: 500 }
    );
  }
}
