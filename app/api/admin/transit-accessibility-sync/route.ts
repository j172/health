import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runTransitAccessibilitySync, runTransitFacilityAlertsSync } from "@/lib/server/transit/runSync";

export const runtime = "nodejs";

/**
 * Manually triggers both TDX Senior/Rail sync jobs (daily Facility/Service/
 * Map/Transfer + the separately-scheduled 30-minute Facility/Alert job —
 * see lib/server/cron/registerJobs.ts) in one call, for admin verification.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const accessibility = await runTransitAccessibilitySync();
  const alerts = await runTransitFacilityAlertsSync();
  const ok = accessibility.ok && alerts.ok;

  return NextResponse.json({ ok, accessibility, alerts }, { status: ok ? 200 : 500 });
}
