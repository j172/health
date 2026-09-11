import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { runIngestExternalEvents } from "@/lib/server/culture/ingestExternalEvents";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runIngestExternalEvents();
    return NextResponse.json(result);
  } catch (error) {
    return internalErrorResponse(error, "External cultural events synchronization failed");
  }
}
