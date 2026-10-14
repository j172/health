import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runFraudDomainsSync } from "@/lib/server/antiFraud/runSync";

export const runtime = "nodejs";

/**
 * POST /api/admin/fraud-domains-sync — issue #564. The 176455 source only
 * runs on a monthly cron; this exposes the same `runFraudDomainsSync()` the
 * cron calls so it can be triggered manually right after deploy to verify
 * the pipeline works, without waiting up to a month for the first tick.
 * Same fire-and-forget 202 pattern as the other `/api/admin/*-sync` routes
 * (e.g. facilities-hours-sync) — the ~93,840-row fetch can exceed
 * Cloudflare's edge-proxy connection cap, so this responds immediately and
 * lets the sync finish in the long-lived pm2 process.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  runFraudDomainsSync()
    .then((result) => console.log("fraud-domains-sync result:", JSON.stringify(result)))
    .catch((error) => console.error("fraud-domains-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
