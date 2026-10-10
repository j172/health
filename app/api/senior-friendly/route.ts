import { NextRequest, NextResponse } from "next/server";
import { getSeniorFriendlyOverview } from "@/lib/server/seniorTourism/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get("county") || undefined;
    const query = searchParams.get("query") || undefined;

    const data = await getSeniorFriendlyOverview({ county, query });

    return NextResponse.json({
      ok: true,
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /api/senior-friendly:", error);
    return NextResponse.json(
      { ok: false, error: "無法取得敬老卡與樂齡觀光資訊" },
      { status: 500 },
    );
  }
}
