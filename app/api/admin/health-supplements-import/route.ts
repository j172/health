import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { upsertHealthSupplements, type HealthSupplementRecord } from "@/lib/server/food/healthSupplements";

export const runtime = "nodejs";
export const maxDuration = 60;

// TFDA's 健康食品(健字號) export (data.fda.gov.tw export/19) is small
// (~400-600 rows) — scripts/import-tfda-health-supplements.mjs fetches and
// POSTs the whole batch here in one call, unlike the food-nutrition import
// which needs GitHub Actions batching.
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const records: HealthSupplementRecord[] | undefined = body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing or empty 'records' array" }, { status: 400 });
  }

  try {
    const { inserted, updated } = await upsertHealthSupplements(records);
    return NextResponse.json({ ok: true, fetched: records.length, inserted, updated });
  } catch (error) {
    return internalErrorResponse(error, "Unknown import error");
  }
}
