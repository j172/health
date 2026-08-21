import { NextRequest, NextResponse } from "next/server";
import { isValidAdminSecret } from "@/lib/server/config/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Long enough for a review session, short enough that a stale cookie stops working. */
const ADMIN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;

export const ADMIN_SESSION_COOKIE = "hz_admin_session";

/**
 * Exchanges a `?key=` query parameter for an httpOnly session cookie, then
 * redirects to the clean URL.
 *
 * The review page used to read the shared admin secret straight out of the query
 * string on every visit, which put it in the browser's history and address bar,
 * in any reverse-proxy access log, and in the `Referer` of anything the page
 * links to. Here the secret appears in a URL exactly once and is never needed
 * again for the life of the cookie.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const target = new URL("/admin/social-queue", request.nextUrl.origin);

  if (!isValidAdminSecret(key)) {
    // Send them to the page unauthenticated; it renders its own Unauthorized state.
    return NextResponse.redirect(target, { status: 303 });
  }

  const response = NextResponse.redirect(target, { status: 303 });
  response.cookies.set(ADMIN_SESSION_COOKIE, key as string, {
    maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/admin",
  });
  return response;
}
