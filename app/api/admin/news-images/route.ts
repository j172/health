import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { assignMissingNewsCardImages, clearPixabayApiCache } from "@/lib/server/news/cardImages";

export const runtime = "nodejs";
export const maxDuration = 300;

const unauthorized = (): NextResponse => NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return unauthorized();
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: unknown; clearCache?: unknown };

    if (body.clearCache === true) {
      const cleared = await clearPixabayApiCache();
      return NextResponse.json({ ok: true, cleared });
    }

    const limit = typeof body.limit === "number" ? body.limit : 10;
    const summary = await assignMissingNewsCardImages(limit);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown card image assignment error",
      },
      { status: 500 },
    );
  }
}