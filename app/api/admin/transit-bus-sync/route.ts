import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runTransitBusSync } from "@/lib/server/transit/runSync";

export const runtime = "nodejs";

/**
 * Manually triggers the TDX Basic Bus low-floor-ratio sync (issue #467 — see
 * lib/server/cron/registerJobs.ts for its daily schedule) for admin
 * verification, e.g. the post-deploy "實際打過 API 確認拿到的是真實數字而非種子值"
 * acceptance criterion: call this once after deploy, then compare
 * /api/accessible-transit's routes against TRANSIT_ROUTES_SEED (real rows
 * carry `source: "tdx_bus"`, seed rows carry `source: "seed"`).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const summary = await runTransitBusSync();

  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
