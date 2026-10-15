import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runGarbageRoutesSync } from "@/lib/server/garbageRoutes/runSync";

export const runtime = "nodejs";

/**
 * POST /api/admin/garbage-routes-sync — issue #674 (B-16). The garbage-truck
 * route sync (臺北市 136515 + 新北市 125664) runs daily at 03:41; this exposes
 * the same `runGarbageRoutesSync()` the cron calls so it can be triggered right
 * after deploy — the DB is empty until the first run, and that first run is also
 * the production host's first real fetch of both city sources. Same
 * fire-and-forget 202 pattern as the other `/api/admin/*-sync` routes: the
 * result is written to ingest_runs/ingest_errors (see /api/admin/ingestion-runs)
 * and to the pm2 log.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  runGarbageRoutesSync()
    .then((result) => console.log("garbage-routes-sync result:", JSON.stringify(result)))
    .catch((error) => console.error("garbage-routes-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
