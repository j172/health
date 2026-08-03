import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";

const unauthorized = (): NextResponse => NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

const secretsMatch = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

/** Checks the x-rss-sync-admin-secret header used by every /api/admin/* route. Returns a 401 response if invalid, or null if the caller should proceed. */
export const requireAdminSecret = (request: Request): NextResponse | null => {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  return secretsMatch(secret, env.rssSyncAdminSecret) ? null : unauthorized();
};
