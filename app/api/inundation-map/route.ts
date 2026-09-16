import { NextRequest, NextResponse } from "next/server";
import { getInundationOverview } from "@/lib/server/inundation/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get("county") || undefined;
    const onlyAlert = searchParams.get("onlyAlert") === "true";

    const data = await getInundationOverview({ county, onlyAlert });

    return NextResponse.json({
      ok: true,
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /api/inundation-map:", error);
    return NextResponse.json(
      { ok: false, error: "無法取得即時路面淹水與警戒資料" },
      { status: 500 }
    );
  }
}
