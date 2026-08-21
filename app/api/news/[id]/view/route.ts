import { NextRequest, NextResponse } from "next/server";
import { withConnectionFallback } from "@/lib/server/db/mysql";
import { consumeRateLimit, clientAddress } from "@/lib/server/http/rateLimit";

export const runtime = "nodejs";

const VIEW_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;

// This is an unauthenticated DB write. The bot filter and the per-article cookie
// stop honest double-counting, but neither survives a caller that simply omits
// the cookie and sends a browser User-Agent, so the endpoint also needs a ceiling
// on how fast one address can drive UPDATEs.
const VIEW_RATE_LIMIT = 30;
const VIEW_RATE_WINDOW_SECONDS = 60;

// Known search/social-preview crawlers — excluded so indexing traffic doesn't
// inflate the "熱門焦點新聞" ranking away from what real readers are viewing.
const BOT_USER_AGENT_PATTERN =
  /bot|spider|crawl|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegrambot|discordbot|pinterestbot|ia_archiver|semrushbot|ahrefsbot|mj12bot|petalbot/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json(
      { ok: false, error: "invalid id" },
      { status: 400 },
    );
  }

  const { allowed, retryAfterSeconds } = consumeRateLimit(
    `view:${clientAddress(request.headers)}`,
    VIEW_RATE_LIMIT,
    VIEW_RATE_WINDOW_SECONDS,
  );
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  if (BOT_USER_AGENT_PATTERN.test(userAgent)) {
    return NextResponse.json({ ok: true, counted: false });
  }

  const cookieName = `nv_${numericId}`;
  if (request.cookies.get(cookieName)) {
    return NextResponse.json({ ok: true, counted: false });
  }

  try {
    await withConnectionFallback(false, async (conn) => {
      await conn.query("UPDATE news_items SET views = views + 1 WHERE id = ?", [
        numericId,
      ]);
      return true;
    });
  } catch (error) {
    console.error("POST /api/news/[id]/view failed:", error);
    return NextResponse.json(
      { ok: false, error: "failed to record view" },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ ok: true, counted: true });
  response.cookies.set(cookieName, "1", {
    maxAge: VIEW_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
  });
  return response;
}
