import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { runRssIngestion } from "@/lib/server/rss/runIngestion";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const isAsync =
    url.searchParams.get("async") === "1" ||
    url.searchParams.get("async") === "true";

  if (isAsync) {
    // Ingesting all feeds (50+ sources) takes 3-5+ minutes, which exceeds
    // edge proxy and reverse proxy socket limits (causing "Empty reply from server").
    // Respond immediately with 202 Accepted and let the long-running pm2 process
    // finish in the background (identical to facilities-sync pattern).
    runRssIngestion("admin-manual")
      .then((summary) =>
        console.log("rss-sync manual results:", JSON.stringify(summary))
      )
      .catch((error) => console.error("rss-sync manual failed:", error));

    return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
  }

  try {
    const summary = await runRssIngestion("admin-manual");
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return internalErrorResponse(error, "Unknown admin sync error");
  }
}