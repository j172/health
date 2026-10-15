import { NextResponse, type NextRequest } from "next/server";
import { PERMANENT_REDIRECT_RULES } from "@/lib/redirects/permanentRedirectRules";

/**
 * Handles every permanent redirect on the site — see
 * lib/redirects/permanentRedirectRules.ts's doc comment for why these moved
 * out of next.config.js's `redirects()` here, and this file's own history
 * for why it issues HTTP 301, not 308.
 *
 * Round 1 (confirmed live 2026-10-15): next.config.js's `redirects()`
 * always adds a non-standard `Refresh` header to any 308 response — see
 * node_modules/next/dist/server/base-http/index.js, an IE11-compatibility
 * shim — and something in this host's Cloudflare/LiteSpeed path 500s on
 * that combination. Moving the redirects here was NOT enough on its own:
 * `node_modules/next/dist/server/lib/router-server.js`'s own request
 * handler adds the exact same `Refresh` header to ANY response whose
 * `statusCode === RedirectStatusCode.PermanentRedirect` (308) and has no
 * body stream — which includes a middleware's `NextResponse.redirect()`
 * result, since a redirect response has no body. So every redirect kept
 * 500ing even after moving to middleware, confirmed live by curling the
 * origin directly (bypassing Cloudflare) and seeing the same `Refresh`
 * header on a middleware-issued redirect.
 *
 * `RedirectStatusCode` only has one entry for 308 (`PermanentRedirect`) —
 * confirmed by reading node_modules/next/dist/client/components/
 * redirect-status-code.js — so an explicit 301 never matches that check and
 * never gets the header added, by either code path. 301 ("Moved
 * Permanently") is the traditional, universally-recognized permanent
 * redirect status; the only practical difference from 308 is that 308
 * preserves the original request method on a resend, which doesn't matter
 * for these plain GET page redirects.
 *
 * next.config.js keeps its one remaining redirect, `/emergency` → 307
 * (permanent: false) — that one was never affected (only a 308 status
 * triggers either Refresh-adding code path) and has no reason to move.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname, searchParams } = request.nextUrl;

  for (const rule of PERMANENT_REDIRECT_RULES) {
    if (rule.source !== pathname) continue;
    if (rule.has && searchParams.get(rule.has.key) !== rule.has.value) continue;

    const destinationUrl = new URL(rule.destination, request.url);
    return NextResponse.redirect(destinationUrl, 301);
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
