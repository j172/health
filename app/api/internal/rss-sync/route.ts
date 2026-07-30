import { NextResponse } from "next/server";
import { requireInternalSecret } from "@/lib/server/config/adminAuth";
import { runRssIngestion } from "@/lib/server/rss/runIngestion";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = requireInternalSecret(request);
  if (unauthorized) return unauthorized;

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