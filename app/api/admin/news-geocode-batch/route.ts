import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { runNewsGeocodeBatch } from "@/lib/server/news/newsGeocodeBatch";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Batch endpoint for geocoding un-located news articles.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    let limit = 20;
    try {
      const body = await request.json();
      if (body && typeof body.limit === "number") {
        limit = Math.min(50, Math.max(1, body.limit));
      }
    } catch {
      // Empty or invalid body is acceptable; use default limit
    }

    const summary = await runNewsGeocodeBatch(limit);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return internalErrorResponse(error, "Unknown news geocode batch error");
  }
}
