import { NextRequest, NextResponse } from "next/server";
import { getCpcPrices, getCpcPriceSummary } from "@/lib/server/cpc/prices";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const summaryOnly = searchParams.get("summary") === "true";
    const category = searchParams.get("category") || undefined;

    if (summaryOnly) {
      const summary = await getCpcPriceSummary();
      return NextResponse.json({ ok: true, ...summary });
    }

    const data = await getCpcPrices(category);
    return NextResponse.json({ ok: true, ...data });
  } catch (error: any) {
    console.error("GET /api/cpc-prices error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch CPC prices" },
      { status: 500 },
    );
  }
}
