import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { upsertWaterLevelReadings } from "@/lib/server/wra/waterLevelQueries";
import type { WaterLevelStationRecord } from "@/lib/server/wra/fetchWaterLevelStations";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/admin/wra-water-level-sync — issue #135's 水位站監測 (WRA), used by both the in-app cron (lib/server/wra/runSync.ts) and scripts/import-wra-water-level.mjs. */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const records: WaterLevelStationRecord[] | undefined = body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing or empty 'records' array" },
      { status: 400 },
    );
  }

  try {
    const { inserted, updated } = await upsertWaterLevelReadings(records);
    return NextResponse.json({
      ok: true,
      fetched: records.length,
      inserted,
      updated,
    });
  } catch (error) {
    return internalErrorResponse(error, "Unknown WRA water level import error");
  }
}
