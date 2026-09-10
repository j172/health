import { NextRequest } from "next/server";
import { GET as handleNpoGet } from "@/app/api/npo-organizations/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Legacy API endpoint alias.
 * Automatically handles existing callers by forwarding to NPO organizations handler.
 */
export async function GET(request: NextRequest) {
  return handleNpoGet(request);
}
