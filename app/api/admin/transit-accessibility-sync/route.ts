import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runTransitFacilityAlertsSync } from "@/lib/server/transit/runSync";

export const runtime = "nodejs";

/**
 * Manually triggers the hourly TDX Senior/Rail Facility/Alert (電梯停用公告) sync — the only TDX
 * job left for the accessible-transit page (see lib/server/cron/registerJobs.ts) — for admin
 * verification. It queues through TDX's shared 5 req/min limiter, 10 requests, roughly 2 minutes.
 *
 * issue #730: the daily Facility/Service/Map/Transfer sync (`?job=accessibility`) was removed,
 * so there is no `?job=` switch any more; the response keeps its `alerts` key.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const alerts = await runTransitFacilityAlertsSync();

  return NextResponse.json({ ok: alerts.ok, alerts }, { status: alerts.ok ? 200 : 500 });
}
