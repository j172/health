import { NextResponse } from "next/server";
import { getFraudDomainsAddedThisMonth } from "@/lib/server/antiFraud/queries";

export const runtime = "nodejs";

/** Shape of this route's JSON body — imported by AntiFraudSidebarWidget.tsx, the sole caller. */
export interface AntiFraudSummaryResponse {
  ok: true;
  count: number;
  hasEverSynced: boolean;
}

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

/**
 * Homepage sidebar summary for the independent anti-fraud widget (issue
 * #575). Deliberately its OWN small route rather than a new field on
 * `/api/home-status` — that route is scoped on purpose to the 5
 * weather/AQI/UV/earthquake/alert sections (see HomeStatusBar.tsx's doc
 * comment), and "本月新增涉詐網域數" isn't one of them.
 *
 * No query params and nothing user-supplied here, so (unlike
 * /api/anti-fraud/check) there's no privacy reason to avoid a public cache
 * — this is one aggregate count over the whole `fraud_domains` table.
 */
export async function GET() {
  try {
    const { count, hasEverSynced } = await getFraudDomainsAddedThisMonth();
    const body: AntiFraudSummaryResponse = { ok: true, count, hasEverSynced };
    return NextResponse.json(body, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error(
      "GET /api/home/anti-fraud-summary error:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { ok: false, error: "查詢失敗，請稍後再試" },
      { status: 500 },
    );
  }
}
