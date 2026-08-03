import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { runDrugSync } from "@/lib/server/drugs/runSync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const results = await runDrugSync();
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return internalErrorResponse(error, "Unknown sync error");
  }
}
