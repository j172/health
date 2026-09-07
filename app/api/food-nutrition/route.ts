import { NextRequest, NextResponse } from "next/server";
import {
  searchFoodSamples,
  getNutritionBySampleId,
  rankFoodsByNutrient,
  listDistinctNutrientItems,
  analyzeMealNutrition,
  type MealItemInput,
} from "@/lib/server/food/nutrition";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode")?.trim();

  if (mode === "nutrients") {
    try {
      const nutrients = await listDistinctNutrientItems();
      return NextResponse.json({ nutrients });
    } catch (error) {
      console.error("GET /api/food-nutrition?mode=nutrients failed:", error);
      return NextResponse.json({ error: "查詢營養素清單失敗" }, { status: 502 });
    }
  }

  if (mode === "rank") {
    const nutrient = request.nextUrl.searchParams.get("nutrient")?.trim();
    if (!nutrient) {
      return NextResponse.json({ error: "Missing required 'nutrient' query param" }, { status: 400 });
    }
    const limitParam = request.nextUrl.searchParams.get("limit");
    const category = request.nextUrl.searchParams.get("category")?.trim() || undefined;
    const limit = limitParam ? Number(limitParam) : undefined;

    try {
      const rows = await rankFoodsByNutrient(nutrient, { limit, category });
      return NextResponse.json({ rows });
    } catch (error) {
      console.error("GET /api/food-nutrition?mode=rank failed:", error);
      return NextResponse.json({ error: "查詢營養素排行失敗" }, { status: 502 });
    }
  }

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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const items: MealItemInput[] | undefined = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Missing or empty 'items' array" }, { status: 400 });
  }

  try {
    const result = await analyzeMealNutrition(items);
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/food-nutrition failed:", error);
    return NextResponse.json({ error: "分析餐點營養成分失敗" }, { status: 502 });
  }
}

