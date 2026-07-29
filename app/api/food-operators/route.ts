import { NextRequest, NextResponse } from "next/server";
import { searchFoodOperators } from "@/lib/server/food/operators";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("keyword")?.trim();
  if (!keyword) {
    return NextResponse.json({ error: "Missing required 'keyword' query param" }, { status: 400 });
  }

  try {
    const operators = await searchFoodOperators(keyword);
    return NextResponse.json({ operators });
  } catch (error) {
    console.error("GET /api/food-operators failed:", error);
    return NextResponse.json({ error: "查詢食品業者資料失敗" }, { status: 502 });
  }
}
