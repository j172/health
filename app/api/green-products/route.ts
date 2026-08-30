import { NextRequest, NextResponse } from "next/server";
import {
  getRecentGreenProducts,
  searchGreenProducts,
  getGreenProductCategories,
} from "@/lib/server/greenProducts/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
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

  try {
    const products =
      keyword || category
        ? await searchGreenProducts({ keyword, classType: category, limit: 50 })
        : await getRecentGreenProducts(30);

    return NextResponse.json({ products }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/green-products failed:", error);
    return NextResponse.json(
      { error: "查詢環保產品資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}

