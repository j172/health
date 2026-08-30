import { NextResponse } from "next/server";
import { getCdcTravelAlerts, type CDCTravelAlertItem, type CDCEpidemicNewsItem } from "@/lib/server/cdc/queries";

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 mins cache

export type { CDCTravelAlertItem, CDCEpidemicNewsItem };

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const country = (searchParams.get("country") || "").trim();
    const disease = (searchParams.get("disease") || "").trim();
    const level = (searchParams.get("level") || "").trim();
    const keyword = (searchParams.get("keyword") || "").trim();

    const data = await getCdcTravelAlerts({
      country: country || undefined,
      disease: disease || undefined,
      level: level || undefined,
      keyword: keyword || undefined,
    });

    return NextResponse.json({
      ok: true,
      alerts: data.alerts,
      epidemicNews: data.epidemicNews,
      stats: data.stats,
      updatedAt: data.updatedAt,
    });
  } catch (error: any) {
    console.error("GET /api/cdc/travel-alerts error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Failed to load CDC alerts from database",
        alerts: [],
        epidemicNews: [],
        stats: { level3Count: 0, level2Count: 0, level1Count: 0, totalCountries: 0 },
      },
      { status: 500 }
    );
  }
}
