import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { upsertFoodNutrition, type FoodNutritionRecord } from "@/lib/server/food/nutrition";

export const runtime = "nodejs";
export const maxDuration = 60;

// TFDA's food nutrition composition export (data.fda.gov.tw InfoId=20) is a
// 4.4MB zip that unpacks to 226k+ JSON records — too much to unzip/parse on
// this host's low ulimit -v. Fetch+unzip+parse runs on GitHub Actions instead
// (scripts/import-tfda-food-nutrition.mjs), which POSTs batches here.
export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const records: FoodNutritionRecord[] | undefined = body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing or empty 'records' array" }, { status: 400 });
  }

  try {
    const { inserted, updated } = await upsertFoodNutrition(records);
    return NextResponse.json({ ok: true, fetched: records.length, inserted, updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown import error" }, { status: 500 });
  }
}
