import { NextRequest, NextResponse } from "next/server";
import { searchFoodSamples, getNutritionBySampleId } from "@/lib/server/food/nutrition";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sampleId = request.nextUrl.searchParams.get("sampleId")?.trim();
  if (sampleId) {
    try {
      const items = await getNutritionBySampleId(sampleId);
      return NextResponse.json({ items });
    } catch (error) {
      console.error("GET /api/food-nutrition?sampleId failed:", error);
      return NextResponse.json({ error: "查詢食品營養成分失敗" }, { status: 502 });
    }
  }

  const keyword = request.nextUrl.searchParams.get("keyword")?.trim();
  if (!keyword) {
    return NextResponse.json({ error: "Missing required 'keyword' or 'sampleId' query param" }, { status: 400 });
  }

  try {
    const samples = await searchFoodSamples(keyword);
    return NextResponse.json({ samples });
  } catch (error) {
    console.error("GET /api/food-nutrition failed:", error);
    return NextResponse.json({ error: "查詢食品營養成分失敗" }, { status: 502 });
  }
}
