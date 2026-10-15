import { NextResponse, type NextRequest } from "next/server";
import { PERMANENT_REDIRECT_RULES } from "@/lib/redirects/permanentRedirectRules";

/**
 * Handles every permanent (308) redirect on the site — see
 * lib/redirects/permanentRedirectRules.ts's doc comment for why these moved
 * out of next.config.js's `redirects()` here (confirmed live 2026-10-15:
 * next.config.js's `redirects()` always adds a non-standard `Refresh`
 * header to a 308 response, which something in this host's Cloudflare/
 * LiteSpeed path can't handle, 500ing on EVERY permanent redirect on the
 * site). `NextResponse.redirect()` below does not add that header.
 *
 * next.config.js keeps its one remaining redirect, `/emergency` → 307
 * (permanent: false) — that one was never affected (only 308s add the
 * Refresh header) and has no reason to move.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname, searchParams } = request.nextUrl;

  for (const rule of PERMANENT_REDIRECT_RULES) {
    if (rule.source !== pathname) continue;
    if (rule.has && searchParams.get(rule.has.key) !== rule.has.value) continue;

    const destinationUrl = new URL(rule.destination, request.url);
    return NextResponse.redirect(destinationUrl, 308);
  }

  return NextResponse.next();
}

// Deliberately broad rather than generated from PERMANENT_REDIRECT_RULES'
// exact source paths: Next.js's matcher must be statically analyzable, and a
// slightly wider match (middleware runs, falls through to NextResponse.next()
// on a miss) is cheap and safer than risking a future rule added to the data
// file silently never reaching middleware because the matcher wasn't
// updated in lockstep. Covers every current rule's source path prefix.
export const config = {
  matcher: ["/", "/nearby", "/guides/:path*", "/tools/:path*", "/en/tools/:path*", "/ja/tools/:path*", "/ko/tools/:path*"],
};
