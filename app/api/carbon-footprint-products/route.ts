import { NextRequest, NextResponse } from "next/server";
import {
  getRecentCarbonFootprintProducts,
  countCarbonFootprintProducts,
  searchCarbonFootprintProducts,
  countSearchCarbonFootprintProducts,
} from "@/lib/server/carbonFootprint/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/** Mirrors PAGE_SIZE_OPTIONS in lib/hooks/usePagination.ts — kept as a literal list here so this route has no client-only import. */
const PAGE_SIZE_OPTIONS = [30, 50, 100];
const DEFAULT_PAGE_SIZE = 30;

const resolvePaging = (searchParams: URLSearchParams): { limit: number; offset: number } => {
  const pageSize = Number(searchParams.get("pageSize"));
  const limit = PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  return { limit, offset: (page - 1) * limit };
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const keyword = params.get("keyword")?.trim() || undefined;
  const { limit, offset } = resolvePaging(params);

  try {
    const [products, total] = keyword
      ? await Promise.all([searchCarbonFootprintProducts({ keyword, limit, offset }), countSearchCarbonFootprintProducts({ keyword })])
      : await Promise.all([getRecentCarbonFootprintProducts(limit, offset), countCarbonFootprintProducts()]);

    return NextResponse.json({ products, total }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/carbon-footprint-products failed:", error);
    return NextResponse.json(
      { error: "查詢碳足跡產品資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}
