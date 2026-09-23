import { NextRequest, NextResponse } from "next/server";
import { getCpcPrices, getCpcPriceSummary } from "@/lib/server/cpc/prices";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const summaryOnly = searchParams.get("summary") === "true";
    const category = searchParams.get("category") || undefined;

    if (summaryOnly) {
      const summary = await getCpcPriceSummary();
      return NextResponse.json({ ok: true, ...summary }, { headers: CACHE_HEADERS });
    }

    const data = await getCpcPrices(category);
    return NextResponse.json({ ok: true, ...data }, { headers: CACHE_HEADERS });
  } catch (error: any) {
    console.error("GET /api/cpc-prices error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch CPC prices" },
      { status: 500 },
    );
  }
}
