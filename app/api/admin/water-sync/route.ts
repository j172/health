import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runWaterOutagesSync } from "@/lib/server/water/ingestWaterOutages";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runWaterOutagesSync();
    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error: any) {
    console.error("[Water Outages Sync Admin Error]", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to execute water outages sync" },
      { status: 500 }
    );
  }
}
