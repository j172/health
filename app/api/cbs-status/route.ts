import { NextResponse } from "next/server";
import { fetchActiveCbsAlerts, type CbsStatusResponse } from "@/lib/server/disaster/cbsAlerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CBS_CACHE_HEADER = "public, max-age=30, s-maxage=60, stale-while-revalidate=120";

export async function GET(request: Request): Promise<NextResponse<CbsStatusResponse>> {
  const url = new URL(request.url);
  const sim = url.searchParams.get("sim");

  if (sim === "active") {
    const now = Date.now();
    const simulatedAlert = {
      id: "sim-cbs-emergency-001",
      headline: "【測試模擬】國家級警報：花蓮縣近海發生規模 6.5 強震",
      description: "花蓮縣近海發生規模 6.5 強震，各地震度花蓮縣 5 弱、宜蘭縣 4 級。請就近避難趴下掩護。",
      event: "地震速報",
      severity: "Extreme" as const,
      effective: new Date(now).toISOString(),
      expires: new Date(now + 3600_000).toISOString(),
      areas: ["花蓮縣秀林鄉", "宜蘭縣南澳鄉"],
      web: "https://cbs.tw",
    };

    return NextResponse.json(
      { activeAlerts: [simulatedAlert], hasActive: true },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  }

  const activeAlerts = await fetchActiveCbsAlerts();
  const hasActive = activeAlerts.length > 0;

  return NextResponse.json(
    { activeAlerts, hasActive },
    {
      headers: {
        "Cache-Control": CBS_CACHE_HEADER,
      },
    },
  );
}
