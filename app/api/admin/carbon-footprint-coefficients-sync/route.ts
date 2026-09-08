import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import {
  upsertCarbonFootprintCoefficients,
  type CarbonFootprintCoefficientRecord,
} from "@/lib/server/carbonFootprint/coefficientsQueries";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const records: CarbonFootprintCoefficientRecord[] | undefined = body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing or empty 'records' array" },
      { status: 400 },
    );
  }

  try {
    const { inserted, updated } = await upsertCarbonFootprintCoefficients(records);
    return NextResponse.json({
      ok: true,
      fetched: records.length,
      inserted,
      updated,
    });
  } catch (error) {
    return internalErrorResponse(error, "Unknown carbon footprint coefficients import error");
  }
}
