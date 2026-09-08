import { NextRequest, NextResponse } from "next/server";
import { getLatestWaterLevelReadingsPage } from "@/lib/server/wra/waterLevelQueries";

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

/** GET /api/wra-water-level?keyword=&page=&pageSize= — issue #135's 水位站監測 (WRA), latest reading per station. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const keyword = params.get("keyword")?.trim() || undefined;
  const { limit, offset } = resolvePaging(params);

  try {
    const { rows, total } = await getLatestWaterLevelReadingsPage({ keyword, limit, offset });
    return NextResponse.json({ stations: rows, total }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/wra-water-level failed:", error);
    return NextResponse.json(
      { error: "查詢水位站監測資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}
