import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runFacilityHoursSync } from "@/lib/server/facilities/runHoursSync";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  runFacilityHoursSync()
    .then(({ matched }) => console.log(`facilities-hours-sync: matched ${matched} rows`))
    .catch((error) => console.error("facilities-hours-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
