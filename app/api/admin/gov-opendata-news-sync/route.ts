import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { syncGovOpenDataNews, type SyncGovNewsOptions } from "@/lib/server/news/fetchGovOpenDataNews";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const isAsync =
    url.searchParams.get("async") === "1" ||
    url.searchParams.get("async") === "true";

  let bodyOptions: Partial<SyncGovNewsOptions> = {};
  try {
    const text = await request.text();
    if (text) {
      bodyOptions = JSON.parse(text);
    }
  } catch {
    // Tolerates empty or non-JSON body, falls back to query params
  }

  const options: SyncGovNewsOptions = {
    sourceId: bodyOptions.sourceId || url.searchParams.get("sourceId") || undefined,
    limit: bodyOptions.limit || (url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined),
    backfill: bodyOptions.backfill ?? (url.searchParams.get("backfill") === "1" || url.searchParams.get("backfill") === "true"),
    dryRun: bodyOptions.dryRun ?? (url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true"),
  };

  if (isAsync) {
    syncGovOpenDataNews(options)
      .then((result) =>
        console.log("gov-opendata-news-sync async results:", JSON.stringify(result))
      )
      .catch((error) => console.error("gov-opendata-news-sync async failed:", error));

    return NextResponse.json({ ok: true, status: "started", options }, { status: 202 });
  }

  try {
    const result = await syncGovOpenDataNews(options);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return internalErrorResponse(error, "Unknown gov open data news sync error");
  }
}
