import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { getRecentRuns } from "@/lib/server/logging/ingestionLogger";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const rows = await getRecentRuns(20);
  return NextResponse.json({ ok: true, rows });
}