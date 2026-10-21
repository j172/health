import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runConflictsGdeltSync, runConflictsGdeltCleanup } from "@/lib/server/conflicts/runSync";

export const runtime = "nodejs";

/**
 * Admin manual-trigger endpoint for the "武裝衝突" (conflicts) item's GDELT
 * sync (issue #774, parent #773) — same `POST /api/admin/<x>-sync`
 * convention every other Global Watch data source already uses (see e.g.
 * app/api/admin/aqi-sync/route.ts). `?action=cleanup` runs the retention
 * sweep instead of the sync (same `?type=`/`?action=`-style fan-out
 * convention app/api/admin/disaster-sync/route.ts already uses); the
 * default (no query param) runs the sync.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "sync";

  if (action === "cleanup") {
    const result = await runConflictsGdeltCleanup();
    if (result.error) {
      return NextResponse.json({ ok: false, error: result.error, result }, { status: 500 });
    }
    return NextResponse.json({ ok: true, result });
  }

  const result = await runConflictsGdeltSync();
  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error, result }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result });
}
