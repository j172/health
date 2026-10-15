import { NextRequest, NextResponse } from "next/server";
import { cacheInit } from "@/lib/server/http/cacheControl";
import { getWaterHardnessSnapshot } from "@/lib/server/waterQuality/queries";
import {
  NOT_IN_TAIWAN_WATER_HEADLINE,
  TAIWAN_WATER_UNSERVED_COUNTIES,
  resolveHardnessLookup,
} from "@/lib/server/waterQuality/hardnessLookup";
import { WATER_HARDNESS_ITEM } from "@/lib/server/waterQuality/hardness";

export const runtime = "nodejs";

/**
 * GET /api/tools/water-quality — data for the 水質 tab on /tools/water-outages
 * (issue #673, Track B B-13). Today: 台水 36605 鄉鎮總硬度. The response is an
 * object with one key per dataset (`hardness`), so the tab's second dataset
 * (B-14, 淨水場檢驗結果) can be added as a sibling key without breaking callers.
 *
 * The whole table (a few hundred rows, ~30 KB) is returned so the page can
 * filter client-side without a request per selection. `?county=&district=`
 * additionally returns `lookup`: the exact answer the page shows for that
 * selection (e.g. `?county=臺北市` → kind "not-in-taiwan-water-area"), which is
 * also what a post-deploy check can curl.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get("county") ?? "";
    const district = searchParams.get("district") ?? "";

    const snapshot = await getWaterHardnessSnapshot();
    const total = snapshot.rows.length;

    return NextResponse.json(
      {
        ok: true,
        hardness: {
          item: WATER_HARDNESS_ITEM,
          total,
          // The file has no date column; this is when this site last saw it.
          syncedAt: snapshot.syncedAt,
          rows: snapshot.rows,
        },
        coverage: {
          headline: NOT_IN_TAIWAN_WATER_HEADLINE,
          unservedCounties: TAIWAN_WATER_UNSERVED_COUNTIES,
        },
        ...(county ? { lookup: resolveHardnessLookup(snapshot.rows, county, district) } : {}),
      },
      // Quarterly data, so cache it — but an empty table (first deploy, before the
      // first sync) must not be pinned at the edge for ten minutes.
      cacheInit(total > 0 ? "reference" : "fast"),
    );
  } catch (error) {
    console.error("Error in /api/tools/water-quality:", error);
    return NextResponse.json({ ok: false, error: "無法取得自來水水質資料" }, { status: 500 });
  }
}
