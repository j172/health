import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { upsertReservoirStatus } from "@/lib/server/wra/reservoirQueries";
import type { ReservoirStatusRecord } from "@/lib/server/wra/fetchReservoirStatus";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/admin/wra-reservoir-status-sync — issue #135's 水庫即時營運狀況 (WRA), used by both the in-app cron (lib/server/wra/runSync.ts) and scripts/import-wra-reservoir-status.mjs. */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const records: ReservoirStatusRecord[] | undefined = body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing or empty 'records' array" },
      { status: 400 },
    );
  }

  try {
    const { inserted, updated } = await upsertReservoirStatus(records);
    return NextResponse.json({
      ok: true,
      fetched: records.length,
      inserted,
      updated,
    });
  } catch (error) {
    return internalErrorResponse(error, "Unknown WRA reservoir status import error");
  }
}
