import { NextRequest, NextResponse } from "next/server";
import {
  getRecentGreenProducts,
  countGreenProducts,
  searchGreenProducts,
  countSearchGreenProducts,
  getGreenProductCategories,
} from "@/lib/server/greenProducts/queries";

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

  if (params.get("categories") === "true") {
    try {
      const categories = await getGreenProductCategories();
      return NextResponse.json({ categories }, { headers: NO_CACHE_HEADERS });
    } catch (error) {
      console.error("GET /api/green-products?categories=true failed:", error);
      return NextResponse.json(
        { error: "查詢產品類別失敗" },
        { status: 502, headers: NO_CACHE_HEADERS },
      );
    }
  }

  const keyword = params.get("keyword")?.trim() || undefined;
  const category = params.get("category")?.trim() || undefined;
  const { limit, offset } = resolvePaging(params);

  try {
    const [products, total] =
      keyword || category
        ? await Promise.all([
            searchGreenProducts({ keyword, classType: category, limit, offset }),
            countSearchGreenProducts({ keyword, classType: category }),
          ])
        : await Promise.all([getRecentGreenProducts(limit, offset), countGreenProducts()]);

    return NextResponse.json({ products, total }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/green-products failed:", error);
    return NextResponse.json(
      { error: "查詢環保產品資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}

