import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runWaterQualitySync } from "@/lib/server/waterQuality/runSync";

export const runtime = "nodejs";

/**
 * POST /api/admin/water-quality-sync — issue #673. The 水質 sync only runs on a
 * monthly cron (`29 5 2 * *`); this exposes the same `runWaterQualitySync()`
 * the cron calls so it can be triggered right after deploy — without it the
 * water_hardness_township table stays empty until the 2nd of next month.
 * Same fire-and-forget 202 pattern as the other `/api/admin/*-sync` routes.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  runWaterQualitySync()
    .then((result) => console.log("water-quality-sync result:", JSON.stringify(result)))
    .catch((error) => console.error("water-quality-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
