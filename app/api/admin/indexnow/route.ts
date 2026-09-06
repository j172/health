import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import {
  getIndexNowKey,
  getIndexNowKeyLocation,
  submitToIndexNow,
  submitRecentNewsToIndexNow,
  submitCorePagesToIndexNow,
} from "@/lib/server/seo/indexnow";
import { getBaseUrl } from "@/lib/server/news/seo";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const baseUrl = getBaseUrl();
  const key = getIndexNowKey();
  const keyLocation = getIndexNowKeyLocation(baseUrl);
  const host = new URL(baseUrl).host;

  return NextResponse.json({
    ok: true,
    host,
    key,
    keyLocation,
    verificationUrl: keyLocation,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => ({}));
    const { action, urls, limit } = body as {
      action?: string;
      urls?: string[];
      limit?: number;
    };

    if (action === "sitemap" || action === "core-pages") {
      const result = await submitCorePagesToIndexNow();
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }

    if (action === "latest-news") {
      const result = await submitRecentNewsToIndexNow(
        typeof limit === "number" && limit > 0 ? Math.min(limit, 1000) : 100,
      );
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }

    if (Array.isArray(urls) && urls.length > 0) {
      const result = await submitToIndexNow(urls);
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Invalid request. Provide 'urls': string[], or 'action': 'latest-news' | 'core-pages'.",
      },
      { status: 400 },
    );
  } catch (error) {
    return internalErrorResponse(error, "IndexNow submission failed");
  }
}
