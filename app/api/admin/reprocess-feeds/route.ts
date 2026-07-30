import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { clearDetailContentForFeeds, invalidatePayloadHashesForFeeds } from "@/lib/server/news/reprocessFeeds";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json().catch(() => ({}))) as { feedCodes?: unknown; mode?: unknown };
    const feedCodes = Array.isArray(body.feedCodes) ? body.feedCodes.filter((c): c is string => typeof c === "string") : [];
    if (feedCodes.length === 0) {
      return NextResponse.json({ ok: false, error: "feedCodes must be a non-empty string array" }, { status: 400 });
    }

    if (body.mode === "clear-detail") {
      const result = await clearDetailContentForFeeds(feedCodes);
      return NextResponse.json({ ok: true, ...result });
    }

    const invalidated = await invalidatePayloadHashesForFeeds(feedCodes);
    return NextResponse.json({ ok: true, invalidated });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown reprocess error",
      },
      { status: 500 },
    );
  }
}
