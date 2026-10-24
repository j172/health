import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";

const unauthorized = (): NextResponse => NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

const secretsMatch = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

/** Timing-safe comparison of a caller-supplied secret against env.rssSyncAdminSecret. Shared by the header check below and any `?key=` query-param page gate (e.g. /admin/social-queue). */
export const isValidAdminSecret = (secret: string | undefined | null): boolean => secretsMatch(secret || "", env.rssSyncAdminSecret);

/** Creates an HMAC-SHA256 session token from a secret key so the raw secret is never stored in browser cookies. */
export const generateAdminSessionToken = (secret: string): string => {
  return createHmac("sha256", secret).update("hz_admin_session_payload").digest("hex");
};

/** Verifies that a browser cookie's session token matches the HMAC signature of env.rssSyncAdminSecret using timing-safe comparison. */
export const isValidAdminSessionToken = (token: string | undefined | null): boolean => {
  if (!token || !env.rssSyncAdminSecret) return false;
  const expected = generateAdminSessionToken(env.rssSyncAdminSecret);
  return secretsMatch(token, expected);
};

/** Checks the x-rss-sync-admin-secret header used by every /api/admin/* route. Returns a 401 response if invalid, or null if the caller should proceed. */
export const requireAdminSecret = (request: Request): NextResponse | null => {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  return isValidAdminSecret(secret) ? null : unauthorized();
};
