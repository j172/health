import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { getAqxDatasetMeta } from "@/lib/server/aqx/datasets";
import { upsertAqxWideRecords, upsertAqxNarrowRecords } from "@/lib/server/aqx/queries";
import type { AqxWideRecord } from "@/lib/server/aqx/fetchAqxWide";
import type { AqxNarrowRecord } from "@/lib/server/aqx/fetchAqxNarrow";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Single admin-sync endpoint shared by all eight AQX_* datasets (issue #131).
 * The dataset's shape ("wide" vs "narrow") is looked up server-side from the
 * registry rather than trusted from the request body, so a malformed/spoofed
 * `shape` field can't route records into the wrong table.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const datasetCode: string | undefined = body?.datasetCode;
  const records: unknown[] | undefined = body?.records;

  if (!datasetCode || !Array.isArray(records) || records.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing 'datasetCode' or empty 'records' array" },
      { status: 400 },
    );
  }

  const meta = getAqxDatasetMeta(datasetCode);
  if (!meta) {
    return NextResponse.json(
      { ok: false, error: `Unknown AQX dataset code: ${datasetCode}` },
      { status: 400 },
    );
  }

  try {
    const { inserted, updated } =
      meta.shape === "wide"
        ? await upsertAqxWideRecords(records as AqxWideRecord[])
        : await upsertAqxNarrowRecords(records as AqxNarrowRecord[]);

    return NextResponse.json({
      ok: true,
      datasetCode,
      shape: meta.shape,
      fetched: records.length,
      inserted,
      updated,
    });
  } catch (error) {
    return internalErrorResponse(error, `Unknown AQX ${datasetCode} import error`);
  }
}

