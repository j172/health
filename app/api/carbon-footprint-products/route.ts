import { NextRequest, NextResponse } from "next/server";
import {
  getRecentCarbonFootprintProducts,
  searchCarbonFootprintProducts,
} from "@/lib/server/carbonFootprint/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const keyword = params.get("keyword")?.trim() || undefined;

  try {
    const products = keyword
      ? await searchCarbonFootprintProducts({ keyword, limit: 50 })
      : await getRecentCarbonFootprintProducts(30);

    return NextResponse.json({ products }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/carbon-footprint-products failed:", error);
    return NextResponse.json(
      { error: "查詢碳足跡產品資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}
