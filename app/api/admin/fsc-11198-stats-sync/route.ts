import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runFscFraudAdStatsSync } from "@/lib/server/antiFraud/runTrendSync";

export const runtime = "nodejs";

/**
 * POST /api/admin/fsc-11198-stats-sync — issue #570. The 11198 source only
 * runs on a weekly cron (see lib/server/cron/registerJobs.ts); this exposes
 * the same `runFscFraudAdStatsSync()` the cron calls so it can be triggered
 * manually right after deploy to verify the trends section actually has
 * data, without waiting up to a week for the first tick. Same pattern as
 * /api/admin/fraud-domains-sync. Note this source's host (www.sfb.gov.tw) is
 * unverified from the production host as of this writing — see
 * lib/server/antiFraud/sources/fsc11198.ts's doc comment — so the first
 * manual trigger of this route after deploy IS that verification.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  runFscFraudAdStatsSync()
    .then((result) => console.log("fsc-11198-stats-sync result:", JSON.stringify(result)))
    .catch((error) => console.error("fsc-11198-stats-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
