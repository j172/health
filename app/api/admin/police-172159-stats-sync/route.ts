import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runPoliceFraudInterdictionStatsSync } from "@/lib/server/antiFraud/runTrendSync";

export const runtime = "nodejs";

/**
 * POST /api/admin/police-172159-stats-sync — issue #570. The 172159 source
 * only runs on a monthly cron (see lib/server/cron/registerJobs.ts); this
 * exposes the same `runPoliceFraudInterdictionStatsSync()` the cron calls
 * so it can be triggered manually right after deploy to verify the
 * trends section actually has data, without waiting up to a month for the
 * first tick. Same pattern as /api/admin/fraud-domains-sync.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  runPoliceFraudInterdictionStatsSync()
    .then((result) => console.log("police-172159-stats-sync result:", JSON.stringify(result)))
    .catch((error) => console.error("police-172159-stats-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
