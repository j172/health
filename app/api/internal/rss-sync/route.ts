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

export async function GET(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-secret") || "";
  if (secret !== env.rssSyncSecret) {
    return unauthorized();
  }

  try {
    const summary = await runRssIngestion("internal-cron");
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown internal sync error",
      },
      { status: 500 },
    );
  }
}