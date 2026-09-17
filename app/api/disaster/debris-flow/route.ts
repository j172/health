import { NextRequest, NextResponse } from "next/server";
import { getDebrisFlowOverview } from "@/lib/server/moa/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get("county") || undefined;
    const level = (searchParams.get("level") as "yellow" | "red") || undefined;

    const data = await getDebrisFlowOverview({ county, level });

    return NextResponse.json({
      ok: true,
      ...data,
    });
  } catch (error) {
    console.error("Error in /api/disaster/debris-flow:", error);
    return NextResponse.json(
      { ok: false, error: "無法取得土石流警戒資訊" },
      { status: 500 }
    );
  }
}
