import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runCdcAlertsSync } from "@/lib/server/cdc/ingestCdcAlerts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    let payload: { travelAlertCsv?: string; intlEpidCsv?: string } | undefined;
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const body = await request.json();
        if (body && (body.travelAlertCsv || body.intlEpidCsv)) {
          payload = {
            travelAlertCsv: body.travelAlertCsv,
            intlEpidCsv: body.intlEpidCsv,
          };
        }
      } catch {
        // Non-JSON or empty body is handled gracefully
      }
    }

    const result = await runCdcAlertsSync(payload);
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

