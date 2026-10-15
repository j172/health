import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runForestFireSync } from "@/lib/server/forestFire/runSync";

export const runtime = "nodejs";

/**
 * POST /api/admin/forest-fire-sync — B-12 / issue #672. The forest-fire feed
 * only runs on the in-process cron (06:09 / 12:09), and forest_fire_alerts is
 * empty right after the first deploy, so this exposes the same
 * `runForestFireSync()` the cron calls to trigger the first sync by hand and
 * verify the pipeline end to end (see the PR's post-deploy TODOs).
 *
 * Unlike the big-file `*-sync` routes this one awaits the result: the feed is a
 * single ~8 KB response (61 rows), so it finishes well inside the edge proxy's
 * connection cap and the caller gets the counts back immediately.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runForestFireSync();
    return NextResponse.json(
      { ok: result.error === null, result },
      { status: result.error === null ? 200 : 502, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("forest-fire-sync failed:", error);
    return NextResponse.json(
      { ok: false, error: "Forest fire sync failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
