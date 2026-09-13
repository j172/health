import { NextResponse } from "next/server";
import { getInundationPoints } from "@/lib/server/wra/inundation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const points = await getInundationPoints();
    return NextResponse.json({
      ok: true,
      count: points.length,
      points,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /api/disaster/inundation:", error);
    return NextResponse.json(
      { ok: false, error: "無法取得即時路面淹水與警戒資料" },
      { status: 500 }
    );
  }
}
