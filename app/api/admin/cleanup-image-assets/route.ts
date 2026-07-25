import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { deleteChromeImageAssets } from "@/lib/server/news/cleanupChromeAssets";

export const runtime = "nodejs";

const unauthorized = (): NextResponse => NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return unauthorized();
  }

  try {
    const deleted = await deleteChromeImageAssets();
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown cleanup error",
      },
      { status: 500 },
    );
  }
}
