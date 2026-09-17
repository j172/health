import { NextRequest, NextResponse } from "next/server";
import { getWaterOutagesOverview } from "@/lib/server/waterOutages/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get("county") || undefined;

    const data = await getWaterOutagesOverview({ county });

    return NextResponse.json({
      ok: true,
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /api/tools/water-outages:", error);
    return NextResponse.json(
      { ok: false, error: "無法取得即時停水與供水站資料" },
      { status: 500 }
    );
  }
}
