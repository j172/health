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
 *
 * Body is read as raw text and JSON-parsed unconditionally, not gated on a
 * content-type check: .remote-health-index.php (the host's PHP front
 * controller for every /api/admin/* request) forwards headers by copying
 * $_SERVER['HTTP_*'] keys only, and PHP exposes Content-Type as the
 * unprefixed $_SERVER['CONTENT_TYPE'] — so that header never reaches this
 * process for requests routed through the public hostname, and a
 * content-type gate here silently discards every csvText override (confirmed
 * live 2026-09-19). Not fixed at the proxy: that file is the host's only
 * recovery path if a deploy goes wrong, so it's treated as high-risk to edit
 * for a problem this route can just avoid depending on.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    let csvText: string | undefined;
    try {
      const raw = await request.text();
      if (raw) {
        const body = JSON.parse(raw);
        if (body && typeof body.csvText === "string" && body.csvText) {
          csvText = body.csvText;
        }
      }
    } catch {
      // Non-JSON or empty body falls through to the in-process fetch.
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
