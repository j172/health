import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runBorderFoodRejectionsSync } from "@/lib/server/borderFood/runSync";

export const runtime = "nodejs";

/**
 * POST /api/admin/border-food-rejections-sync — issue #671. The weekly cron
 * (Mondays 02:39) is the only scheduled caller; right after a deploy the table
 * is empty, so this exposes the same `runBorderFoodRejectionsSync()` for a
 * manual first run (and to confirm data.fda.gov.tw/export/52 is reachable from
 * the production host) without waiting for the next Monday. Same fire-and-forget
 * 202 pattern as /api/admin/moda-165027-sync; the outcome lands in the logs and
 * in the ingestion-runs table (/api/admin/ingestion-runs).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  runBorderFoodRejectionsSync()
    .then((result) => console.log("border-food-rejections-sync result:", JSON.stringify(result)))
    .catch((error) => console.error("border-food-rejections-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
