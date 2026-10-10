import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import {
  runSeniorTourismSync,
  runSeniorTourismAlertsSync,
  runSeniorCardSync,
} from "@/lib/server/seniorTourism/runSync";

export const runtime = "nodejs";

/**
 * Manually triggers all 3 TDX Senior/Tourism + SeniorCard sync jobs (daily
 * Facility/Service/SeniorTourPackage + the separately-scheduled 30-minute
 * Facility/Alert job + the daily 22-county SeniorCard loop — see
 * lib/server/cron/registerJobs.ts) in one call, for admin verification.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const tourism = await runSeniorTourismSync();
  const alerts = await runSeniorTourismAlertsSync();
  const seniorCard = await runSeniorCardSync();
  const ok = tourism.ok && alerts.ok && seniorCard.ok;

  return NextResponse.json({ ok, tourism, alerts, seniorCard }, { status: ok ? 200 : 500 });
}
