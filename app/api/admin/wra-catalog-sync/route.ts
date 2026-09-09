import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { runWraCatalogSync } from "@/lib/server/wra/runSync";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/admin/wra-catalog-sync — syncs both WRA reservoir catalog (139336) and water level station catalog (22227). */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const results = await runWraCatalogSync();
    return NextResponse.json({
      ok: true,
      results,
    });
  } catch (error) {
    return internalErrorResponse(error, "Unknown WRA catalog sync error");
  }
}
