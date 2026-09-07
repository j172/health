import { NextRequest, NextResponse } from "next/server";
import { searchDrugs, countSearchDrugs, getRecentDrugs, countDrugs } from "@/lib/server/drugs/queries";
import { getIngredientsByLicenseNo } from "@/lib/server/drugs/ingredientsQueries";

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
  const licenseNo = request.nextUrl.searchParams.get("licenseNo")?.trim();
  if (licenseNo) {
    try {
      const ingredients = await getIngredientsByLicenseNo(licenseNo);
      return NextResponse.json({ ingredients }, { headers: NO_CACHE_HEADERS });
    } catch (error) {
      console.error("GET /api/drugs?licenseNo failed:", error);
      return NextResponse.json(
        { error: "查詢藥品成分失敗" },
        { status: 502, headers: NO_CACHE_HEADERS },
      );
    }
  }

  const keyword = request.nextUrl.searchParams.get("keyword")?.trim();
  const { limit, offset } = resolvePaging(request.nextUrl.searchParams);

  try {
    const [drugs, total] = keyword
      ? await Promise.all([searchDrugs(keyword, limit, offset), countSearchDrugs(keyword)])
      : await Promise.all([getRecentDrugs(limit, offset), countDrugs()]);
    return NextResponse.json({ drugs, total }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/drugs failed:", error);
    return NextResponse.json(
      { error: "查詢藥品資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}
