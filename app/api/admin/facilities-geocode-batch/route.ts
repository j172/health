import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { runGeocodeBatch } from "@/lib/server/facilities/geocodeBatch";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Unified, budget-aware geocode batch endpoint covering all 16 facility
 * sources (see lib/server/facilities/geocodeBatch.ts and
 * docs/specs/phase9-opencage-geocode-batch.md) — the production path,
 * called repeatedly (e.g. every 10 min from a scheduled workflow) until its
 * daily budget is exhausted or there's nothing left to do. No body params:
 * scope/limits/provider order are all fixed by the module, not caller input.
 * The older single-source /api/admin/facilities-geocode stays available for
 * manual/ad-hoc use.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const summary = await runGeocodeBatch();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return internalErrorResponse(error, "Unknown geocode batch error");
  }
}
