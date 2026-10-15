import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runTransitAccessibilitySync, runTransitFacilityAlertsSync } from "@/lib/server/transit/runSync";

export const runtime = "nodejs";

/**
 * Manually triggers the TDX Senior/Rail sync jobs (daily Facility/Service/
 * Map/Transfer + the separately-scheduled 30-minute Facility/Alert job —
 * see lib/server/cron/registerJobs.ts) for admin verification.
 *
 * Both jobs queue through TDX's shared 5 req/min limiter, so the daily job
 * alone takes ~11 minutes and the alerts job ~2 — far longer than a proxy
 * will hold one HTTP request open. Pass `?job=alerts` or `?job=accessibility`
 * to run just one; with no param both run back to back (original behavior).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const job = new URL(request.url).searchParams.get("job");
  const accessibility = job === "alerts" ? null : await runTransitAccessibilitySync();
  const alerts = job === "accessibility" ? null : await runTransitFacilityAlertsSync();
  const ok = (accessibility?.ok ?? true) && (alerts?.ok ?? true);

  return NextResponse.json({ ok, accessibility, alerts }, { status: ok ? 200 : 500 });
}
