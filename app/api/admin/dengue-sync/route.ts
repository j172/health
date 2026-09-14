import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { syncDengueVectorSurvey } from "@/lib/server/dengue/ingestDengueVectorSurvey";

export const runtime = "nodejs";

/**
 * Admin sync endpoint for the CDC (疾病管制署) dengue mosquito vector survey
 * dataset (issue #269) — same shape as /api/admin/disaster-sync.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await syncDengueVectorSurvey();
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    console.error("[Dengue Sync Admin Error]", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to execute dengue vector survey sync" },
      { status: 500 },
    );
  }
}
