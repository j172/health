import { NextRequest, NextResponse } from "next/server";
import {
  getRecentGreenProducts,
  searchGreenProducts,
  getGreenProductCategories,
} from "@/lib/server/greenProducts/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (params.get("categories") === "true") {
    try {
      const categories = await getGreenProductCategories();
      return NextResponse.json({ categories });
    } catch (error) {
      console.error("GET /api/green-products?categories=true failed:", error);
      return NextResponse.json(
        { error: "查詢產品類別失敗" },
        { status: 502 },
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

    return NextResponse.json({ products });
  } catch (error) {
    console.error("GET /api/green-products failed:", error);
    return NextResponse.json(
      { error: "查詢環保產品資料失敗" },
      { status: 502 },
    );
  }
}

