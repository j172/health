import { NextResponse } from "next/server";
import { getRecentWhoOutbreakNews } from "@/lib/server/who/queries";

// Issue #597 (parent #583): first read-side API route for who_outbreak_news
// (issue #596 shipped the sync pipeline with no UI route at all). Feeds the
// 國際疫情 item's WHO-pin overlay — same shape/caching convention as
// /api/cdc/travel-alerts (app/api/cdc/travel-alerts/route.ts).
export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 mins cache

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=7200",
};

export async function GET() {
  try {
    const articles = await getRecentWhoOutbreakNews();
    return NextResponse.json({ ok: true, articles }, { headers: CACHE_HEADERS });
  } catch (error: any) {
    console.error("GET /api/who/outbreak-news error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Failed to load WHO outbreak news from database",
        articles: [],
      },
      { status: 500 },
    );
  }
}
