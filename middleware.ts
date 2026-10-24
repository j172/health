import { NextResponse, type NextRequest } from "next/server";
import { PERMANENT_REDIRECT_RULES } from "@/lib/redirects/permanentRedirectRules";

/**
 * Injects required HTTP security headers into all responses:
 * - Strict-Transport-Security (HSTS)
 * - X-Frame-Options: SAMEORIGIN (prevents clickjacking)
 * - X-Content-Type-Options: nosniff (prevents MIME sniffing)
 * - Referrer-Policy: strict-origin-when-cross-origin (unless already set, e.g. for /admin)
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (!response.headers.has("Referrer-Policy")) {
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  return response;
}

/**
 * Handles every permanent redirect on the site and attaches global security headers.
 * See lib/redirects/permanentRedirectRules.ts for the 301 vs 308 details.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname, searchParams } = request.nextUrl;

  for (const rule of PERMANENT_REDIRECT_RULES) {
    if (rule.source !== pathname) continue;
    if (rule.has && searchParams.get(rule.has.key) !== rule.has.value) continue;

    const destinationUrl = new URL(rule.destination, request.url);
    const redirectResponse = NextResponse.redirect(destinationUrl, 301);
    return applySecurityHeaders(redirectResponse);
  }

  const response = NextResponse.next();
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    // Explicit prefixes required by PERMANENT_REDIRECT_RULES coverage verification
    "/",
    "/nearby",
    "/guides/:path*",
    "/tools/:path*",
    "/en/tools/:path*",
    "/ja/tools/:path*",
    "/ko/tools/:path*",
    // Site-wide security header coverage across all routes, bypassing static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
