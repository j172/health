import { NextRequest, NextResponse } from "next/server";
import {
  getRecentTaxOrganizations,
  countTaxOrganizations,
  searchTaxOrganizations,
  countSearchTaxOrganizations,
  getTaxOrganizationCities,
} from "@/lib/server/taxOrganizations/queries";

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

  if (params.get("cities") === "true") {
    try {
      const cities = await getTaxOrganizationCities();
      return NextResponse.json({ cities }, { headers: NO_CACHE_HEADERS });
    } catch (error) {
      console.error("GET /api/tax-organizations?cities=true failed:", error);
      return NextResponse.json(
        { error: "查詢縣市清單失敗" },
        { status: 502, headers: NO_CACHE_HEADERS },
      );
    }
  }

  const keyword = params.get("keyword")?.trim() || undefined;
  const city = params.get("city")?.trim() || undefined;
  const { limit, offset } = resolvePaging(params);

  try {
    const [items, total] =
      keyword || (city && city !== "全部縣市")
        ? await Promise.all([searchTaxOrganizations({ keyword, city, limit, offset }), countSearchTaxOrganizations({ keyword, city })])
        : await Promise.all([getRecentTaxOrganizations(limit, offset), countTaxOrganizations()]);

    return NextResponse.json({ items, total }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/tax-organizations failed:", error);
    return NextResponse.json(
      { error: "查詢非營利組織名冊失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}

