import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runModa165027Sync } from "@/lib/server/antiFraud/runSync";

export const runtime = "nodejs";

/**
 * POST /api/admin/moda-165027-sync — issue #567. The 165027 source only
 * runs on a daily cron; this exposes the same `runModa165027Sync()` the
 * cron calls so it can be triggered manually right after deploy to verify
 * the pipeline (and www-api.moda.gov.tw's reachability from the production
 * host) works, without waiting for the next tick. Same fire-and-forget 202
 * pattern as the sibling /api/admin/fraud-domains-sync route.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  runModa165027Sync()
    .then((result) => console.log("moda-165027-sync result:", JSON.stringify(result)))
    .catch((error) => console.error("moda-165027-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
