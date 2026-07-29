import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { fetchTfdaDrugIngredients } from "@/lib/server/drugs/sources/tfdaDrugIngredients";
import { upsertDrugIngredients } from "@/lib/server/drugs/ingredientsQueries";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // 125k+ rows upserted in 500-row chunks comfortably exceeds Cloudflare's
  // edge-proxy connection cap (~100s) and the drugs-sync route's own 60s
  // maxDuration — respond immediately and let it finish in this long-lived
  // pm2 process, same fire-and-forget pattern as facilities-sync.
  (async () => {
    try {
      const records = await fetchTfdaDrugIngredients();
      const { inserted, updated } = await upsertDrugIngredients(records);
      console.log("drugs-ingredients-sync result:", JSON.stringify({ fetched: records.length, inserted, updated }));
    } catch (error) {
      console.error("drugs-ingredients-sync failed:", error);
    }
  })();

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
