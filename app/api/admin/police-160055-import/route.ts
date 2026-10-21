import { NextRequest, NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { fetchPolice160055FraudDomains } from "@/lib/server/antiFraud/sources/police160055";
import { upsertFraudDomains } from "@/lib/server/antiFraud/queries";

export const runtime = "nodejs";

/**
 * POST /api/admin/police-160055-import — issue #567.
 *
 * the former `scripts/import-police-160055.mjs` (removed 2026-10-21, see git
 * history) did the same one-time historical import but was "direct-DB only
 * (no admin-API path)", same situation as scripts/backfill-news-topics.mjs
 * before #584 closed that gap for #565. This host's shared hosting has a
 * documented 20-Entry-Process ceiling and no SSH AllowTcpForwarding (see
 * docs/domains memory), so spawning an extra node process or improvising a
 * tunnel to run the script directly on the host carries real operational
 * risk for a one-off task.
 *
 * This route runs the exact same fetch+upsert the script does, inside the
 * running app process: no SSH, no scp, no new process. Defaults to
 * dry-run; pass ?execute=1 to write. 160055 stopped updating after
 * 2025-12-31 (folded into 176455), so this is meant to be called exactly
 * once, not on any recurring schedule.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const execute = request.nextUrl.searchParams.get("execute") === "1";

  runImport(execute)
    .then((summary) => console.log("police-160055-import result:", JSON.stringify(summary)))
    .catch((error) => console.error("police-160055-import failed:", error));

  return NextResponse.json({ ok: true, status: "started", execute }, { status: 202 });
}

async function runImport(execute: boolean) {
  const records = await fetchPolice160055FraudDomains();
  if (!execute || records.length === 0) {
    return { dryRun: !execute, fetched: records.length, inserted: 0, updated: 0 };
  }
  const { inserted, updated } = await upsertFraudDomains(records);
  return { dryRun: false, fetched: records.length, inserted, updated };
}
