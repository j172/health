import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { runRssIngestion } from "@/lib/server/rss/runIngestion";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const summary = await runRssIngestion("admin-manual");
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return internalErrorResponse(error, "Unknown admin sync error");
  }
}