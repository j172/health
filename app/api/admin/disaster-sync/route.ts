import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import {
  syncRescueUnits,
  syncEocCenters,
  syncShelters,
} from "@/lib/server/disaster/ingestDisasterPoints";

export const runtime = "nodejs";

/**
 * Admin sync endpoint for the three MOI (內政部) disaster-preparedness point
 * datasets (issue #168) — same `?type=` fan-out convention as
 * /api/admin/culture-sync. `type=all` (the default) runs all three.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";

    let rescueUnits: Awaited<ReturnType<typeof syncRescueUnits>> | null = null;
    let eocCenters: Awaited<ReturnType<typeof syncEocCenters>> | null = null;
    let shelters: Awaited<ReturnType<typeof syncShelters>> | null = null;

    if (type === "rescue_units" || type === "all") {
      rescueUnits = await syncRescueUnits();
    }
    if (type === "eoc_centers" || type === "all") {
      eocCenters = await syncEocCenters();
    }
    if (type === "shelters" || type === "all") {
      shelters = await syncShelters();
    }

    return NextResponse.json({
      ok: true,
      results: { rescueUnits, eocCenters, shelters },
    });
  } catch (error: any) {
    console.error("[Disaster Sync Admin Error]", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to execute disaster sync" },
      { status: 500 },
    );
  }
}
