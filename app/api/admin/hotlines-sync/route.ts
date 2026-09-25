import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { upsertGovernmentHotlines, type HotlineRecord } from "@/lib/server/hotlines/hotlinesQueries";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/hotlines-sync
 * Ingests Taiwan government hotlines into MySQL.
 * Accepts optional `{ records: HotlineRecord[] }` in body.
 * If body is empty or records not provided, falls back to `data/government-hotlines.json`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => null);
    let records: HotlineRecord[] | undefined = body?.records;

    if (!Array.isArray(records) || records.length === 0) {
      const filePath = path.join(process.cwd(), "data", "government-hotlines.json");
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        records = JSON.parse(raw);
      }
    }

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hotline records found in request body or seed file" },
        { status: 400 },
      );
    }

    const { inserted, updated } = await upsertGovernmentHotlines(records);

    return NextResponse.json({
      ok: true,
      total: records.length,
      inserted,
      updated,
    });
  } catch (error) {
    return internalErrorResponse(error, "Failed to sync government hotlines");
  }
}
