import { NextResponse } from "next/server";
import {
  searchCulturalEvents,
} from "@/lib/server/culture/queries";
import {
  type CulturalShowInfo,
  type CulturalActivityItem,
  CATEGORY_LABELS,
  ALL_CATEGORIES,
} from "@/lib/server/culture/types";

export const dynamic = "force-dynamic";

export type { CulturalShowInfo, CulturalActivityItem };
export { CATEGORY_LABELS, ALL_CATEGORIES };

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "all";
    const keyword = (searchParams.get("keyword") || "").trim();
    const city = (searchParams.get("city") || "").trim();
    const limit = parseInt(searchParams.get("limit") || "300", 10);

    const result = await searchCulturalEvents({
      category: category === "all" ? undefined : category,
      keyword: keyword || undefined,
      city: city && city !== "全部縣市" ? city : undefined,
      limit: isNaN(limit) ? 300 : limit,
    });

    return NextResponse.json({
      ok: true,
      count: result.items.length,
      totalMatched: result.totalMatched,
      items: result.items,
      updatedAt: result.updatedAt,
    });
  } catch (error: any) {
    console.error("[Cultural shows API error]:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch cultural shows" },
      { status: 500 }
    );
  }
}
