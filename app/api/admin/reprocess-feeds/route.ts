import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { invalidatePayloadHashesForFeeds } from "@/lib/server/news/reprocessFeeds";

export const runtime = "nodejs";

const unauthorized = (): NextResponse => NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return unauthorized();
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { feedCodes?: unknown };
    const feedCodes = Array.isArray(body.feedCodes) ? body.feedCodes.filter((c): c is string => typeof c === "string") : [];
    if (feedCodes.length === 0) {
      return NextResponse.json({ ok: false, error: "feedCodes must be a non-empty string array" }, { status: 400 });
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
