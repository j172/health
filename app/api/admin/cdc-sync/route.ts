import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runCdcAlertsSync } from "@/lib/server/cdc/ingestCdcAlerts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runCdcAlertsSync();
    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error: any) {
    console.error("[CDC Sync Admin Error]", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to execute CDC alerts sync" },
      { status: 500 }
    );
  }
}
