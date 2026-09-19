import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { syncDengueVectorSurvey } from "@/lib/server/dengue/ingestDengueVectorSurvey";

export const runtime = "nodejs";

/**
 * Admin sync endpoint for the CDC (疾病管制署) dengue mosquito vector survey
 * dataset (issue #269) — same shape as /api/admin/disaster-sync.
 *
 * Accepts an optional `{ csvText }` body: od.cdc.gov.tw only allows Taiwan-ISP
 * source IPs (see ingestDengueVectorSurvey.ts), so scripts/local-dengue-relay.mjs
 * fetches the CSV from a Taiwan-ISP network and forwards it here instead of
 * relying on this endpoint's own (always-blocked) fetch — same shape as
 * /api/admin/cdc-sync's travelAlertCsv/intlEpidCsv override.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    let csvText: string | undefined;
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const body = await request.json();
        if (body && typeof body.csvText === "string" && body.csvText) {
          csvText = body.csvText;
        }
      } catch {
        // Non-JSON or empty body falls through to the in-process fetch.
      }
    }

    const result = await syncDengueVectorSurvey(csvText);
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    console.error("[Dengue Sync Admin Error]", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to execute dengue vector survey sync" },
      { status: 500 },
    );
  }
}
