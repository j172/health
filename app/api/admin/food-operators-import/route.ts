import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { upsertFoodOperators, type FoodOperatorRecord } from "@/lib/server/food/operators";

export const runtime = "nodejs";
export const maxDuration = 60;

// TFDA's food business operator registry (data.fda.gov.tw export/97) is a
// 19MB zip that unpacks to 825k+ JSON records — too much to unzip/parse on
// this host's low ulimit -v. Fetch+unzip+parse runs on GitHub Actions instead
// (scripts/import-tfda-food-operators.mjs), which POSTs batches here.
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const records: FoodOperatorRecord[] | undefined = body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing or empty 'records' array" }, { status: 400 });
  }

  try {
    const { inserted, updated } = await upsertFoodOperators(records);
    return NextResponse.json({ ok: true, fetched: records.length, inserted, updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown import error" }, { status: 500 });
  }
}
