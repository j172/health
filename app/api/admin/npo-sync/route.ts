import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { ingestNpoOrganizations } from "@/lib/server/npoOrganizations/ingestNpoOrganizations";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  let startPage = 1;
  let maxPages = 5;

  try {
    const url = new URL(request.url);
    const qStart = url.searchParams.get("startPage");
    const qMax = url.searchParams.get("maxPages");
    if (qStart) startPage = Math.max(1, Number(qStart));
    if (qMax) maxPages = Math.min(20, Math.max(1, Number(qMax)));

    const body = await request.json().catch(() => ({}));
    if (body?.startPage) startPage = Math.max(1, Number(body.startPage));
    if (body?.maxPages) maxPages = Math.min(20, Math.max(1, Number(body.maxPages)));
  } catch {
    // fallback
  }

  try {
    const result = await ingestNpoOrganizations({ startPage, maxPages });
    return NextResponse.json(result);
  } catch (error) {
    return internalErrorResponse(error, "NPO synchronization failed");
  }
}
