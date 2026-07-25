import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { runRssIngestion } from "@/lib/server/rss/runIngestion";

export const runtime = "nodejs";

const unauthorized = (): NextResponse =>
  NextResponse.json(
    {
      ok: false,
      error: "Unauthorized",
    },
    { status: 401 },
  );

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return unauthorized();
  }

  try {
    const summary = await runRssIngestion("admin-manual");
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown admin sync error",
      },
      { status: 500 },
    );
  }
}