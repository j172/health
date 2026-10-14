import { NextRequest, NextResponse } from "next/server";
import { checkSuspiciousUrl } from "@/lib/server/antiFraud/checkSuspiciousUrl";
import { findFraudDomainsByHosts, getFraudDomainsLastSyncedAt } from "@/lib/server/antiFraud/queries";

export const runtime = "nodejs";

/**
 * Query API for the anti-fraud URL checker (issue #564).
 *
 * GET + `?url=` (not POST): kept consistent with this repo's other simple
 * lookup APIs (e.g. /api/facilities), which is worth more than the
 * marginal privacy gain of POST here — this endpoint is same-origin,
 * browser-only, never linked to or bookmarked with a real query embedded,
 * and `Cache-Control: no-store` below already closes the one real risk a
 * GET-with-query-string has: a CDN or shared cache keying on the URL and
 * leaking one visitor's pasted link to another. If this response is ever
 * fronted by a cache that ignores `no-store`, switch to POST instead of
 * adding more headers.
 *
 * Privacy requirement (issue #564): the pasted URL itself must never be
 * written to any log or error message on this server. This handler never
 * passes the raw `url` query param (or `checkSuspiciousUrl`'s
 * `normalizedHost`) to `console.*` on any path, including the catch block
 * below — only the error's own message, which comes from the DB client or
 * `checkSuspiciousUrl`'s own code, neither of which embeds the query value.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  const noStoreHeaders = { "Cache-Control": "no-store" };

  if (!url || !url.trim()) {
    return NextResponse.json(
      { error: "請提供要查詢的網址" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const [result, lastSyncedAt] = await Promise.all([
      checkSuspiciousUrl(url, findFraudDomainsByHosts),
      getFraudDomainsLastSyncedAt(),
    ]);

    return NextResponse.json(
      { ...result, lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    // Deliberately logs only the error's own message — never `url` — see
    // the privacy requirement in this route's doc comment above.
    console.error("GET /api/anti-fraud/check failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "查詢失敗，請稍後再試" },
      { status: 502, headers: noStoreHeaders },
    );
  }
}
