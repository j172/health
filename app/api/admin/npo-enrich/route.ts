import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { enrichNpoOrganizations } from "@/lib/server/npoOrganizations/enrichNpoSources";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await enrichNpoOrganizations();
    return NextResponse.json(result);
  } catch (error) {
    return internalErrorResponse(error, "NPO multi-source enrichment failed");
  }
}
