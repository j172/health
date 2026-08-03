import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";

const unauthorized = (): NextResponse => NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

/** Checks the x-rss-sync-admin-secret header used by every /api/admin/* route. Returns a 401 response if invalid, or null if the caller should proceed. */
export const requireAdminSecret = (request: Request): NextResponse | null => {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  return secret === env.rssSyncAdminSecret ? null : unauthorized();
};
