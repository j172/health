import { NextResponse } from "next/server";
import { getForestFireOverview } from "@/lib/server/forestFire/queries";
import { taipeiDate } from "@/lib/server/forestFire/parse";

// B-12 / issue #672: forest-fire levels (農業部 ForestFireAlertWCF) for the
// /tools/outdoor-safety page. The data changes at most a couple of times a day
// (the cron job runs at 06:09 and 12:09), so a short edge cache is plenty.
//
// This route sets an explicit Cache-Control on every response: unlabeled
// /api/* routes fall into an upstream default of max-age=1800 (see
// docs/2.0/track-b-opendata-phase2-3-spec.md section 4 item 4). An empty or
// not-yet-current overview is cached only briefly so the first post-sync
// request is not stuck behind a cached "no data" answer; errors are never cached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CURRENT = "public, s-maxage=600, stale-while-revalidate=1800";
const CACHE_NOT_CURRENT = "public, s-maxage=60, stale-while-revalidate=120";
const CACHE_ERROR = "no-store";

export async function GET() {
  try {
    const overview = await getForestFireOverview(taipeiDate());
    return NextResponse.json(
      { ok: true, data: overview },
      {
        headers: {
          "Cache-Control": overview.isCurrent ? CACHE_CURRENT : CACHE_NOT_CURRENT,
        },
      },
    );
  } catch (error) {
    console.error("GET /api/outdoor-safety/forest-fire error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load forest fire risk data" },
      { status: 500, headers: { "Cache-Control": CACHE_ERROR } },
    );
  }
}
