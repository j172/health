import { NextRequest, NextResponse } from "next/server";
import { getTransitAccessibilityOverview } from "@/lib/server/transit/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get("county") || undefined;
    const systemType = searchParams.get("systemType") || undefined;
    const query = searchParams.get("query") || undefined;

    const data = await getTransitAccessibilityOverview({ county, systemType, query });

    return NextResponse.json({
      ok: true,
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /api/accessible-transit:", error);
    return NextResponse.json(
      { ok: false, error: "無法取得無障礙交通資訊" },
      { status: 500 }
    );
  }
}
