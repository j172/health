import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { assignMissingNewsCardImages, clearPixabayApiCache } from "@/lib/server/news/cardImages";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

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