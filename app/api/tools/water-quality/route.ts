import { NextRequest, NextResponse } from "next/server";
import { cacheInit } from "@/lib/server/http/cacheControl";
import { getWaterHardnessSnapshot } from "@/lib/server/waterQuality/queries";
import {
  NOT_IN_TAIWAN_WATER_HEADLINE,
  TAIWAN_WATER_UNSERVED_COUNTIES,
  resolveHardnessLookup,
} from "@/lib/server/waterQuality/hardnessLookup";
import { WATER_HARDNESS_ITEM } from "@/lib/server/waterQuality/hardness";
import { getWaterPlantQualityDetail, getWaterPlantQualitySnapshot } from "@/lib/server/waterQuality/plantQualityQueries";
import { PLANT_QUALITY_DISCLAIMER, parsePlantKey, summarizePlantQuality } from "@/lib/server/waterQuality/plantQualityLookup";

export const runtime = "nodejs";

/**
 * GET /api/tools/water-quality — data for the 水質 tab on /tools/water-outages
 * (Track B B-13 #673 + B-14 #676). One key per dataset:
 *
 * - `hardness` — 台水 36605 鄉鎮總硬度. The whole table (a few hundred rows,
 *   ~30 KB) so the page can filter client-side. `?county=&district=`
 *   additionally returns `lookup`: the exact answer the page shows for that
 *   selection (e.g. `?county=臺北市` → kind "not-in-taiwan-water-area").
 * - `plantQuality` — 台水 6308 淨水場檢驗結果: every plant WITHOUT its 68 test
 *   results (~46 KB), the plant counts by the file's own 水質合格否 flag, and
 *   `sourceUpdatedOn`, the file's 「更新日期」 (the data date the page shows).
 *   `?plant=<officeCode>:<plantCode>` returns that one plant with all of its
 *   results instead (values are the file's original strings: "ND", "<1", "－－").
 *
 * The datasets fail independently: if one query throws, its key is `null` and
 * the other still answers; only when both fail is it a 500.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const plantParam = searchParams.get("plant");
  if (plantParam !== null) {
    return handlePlantDetail(plantParam);
  }

  const county = searchParams.get("county") ?? "";
  const district = searchParams.get("district") ?? "";

  const [hardnessResult, plantResult] = await Promise.allSettled([
    getWaterHardnessSnapshot(),
    getWaterPlantQualitySnapshot(),
  ]);

  if (hardnessResult.status === "rejected") {
    console.error("Error loading water hardness in /api/tools/water-quality:", hardnessResult.reason);
  }
  if (plantResult.status === "rejected") {
    console.error("Error loading water plant quality in /api/tools/water-quality:", plantResult.reason);
  }
  if (hardnessResult.status === "rejected" && plantResult.status === "rejected") {
    return NextResponse.json({ ok: false, error: "無法取得自來水水質資料" }, { status: 500 });
  }

  const hardnessSnapshot = hardnessResult.status === "fulfilled" ? hardnessResult.value : null;
  const plantSnapshot = plantResult.status === "fulfilled" ? plantResult.value : null;
  const hardnessTotal = hardnessSnapshot?.rows.length ?? 0;
  const plantTotal = plantSnapshot?.plants.length ?? 0;

  return NextResponse.json(
    {
      ok: true,
      hardness: hardnessSnapshot
        ? {
            item: WATER_HARDNESS_ITEM,
            total: hardnessTotal,
            // The file has no date column; this is when this site last saw it.
            syncedAt: hardnessSnapshot.syncedAt,
            rows: hardnessSnapshot.rows,
          }
        : null,
      plantQuality: plantSnapshot
        ? {
            total: plantTotal,
            stats: summarizePlantQuality(plantSnapshot.plants),
            // The file's own 更新日期 — NOT this site's sync time (that is syncedAt).
            sourceUpdatedOn: plantSnapshot.sourceUpdatedOn,
            syncedAt: plantSnapshot.syncedAt,
            notice: PLANT_QUALITY_DISCLAIMER,
            plants: plantSnapshot.plants,
          }
        : null,
      coverage: {
        headline: NOT_IN_TAIWAN_WATER_HEADLINE,
        unservedCounties: TAIWAN_WATER_UNSERVED_COUNTIES,
      },
      ...(county && hardnessSnapshot ? { lookup: resolveHardnessLookup(hardnessSnapshot.rows, county, district) } : {}),
    },
    // Monthly data, so cache it — but an empty or partly failed answer (first deploy
    // before the first sync, or one dataset's query failing) must not be pinned at
    // the edge for ten minutes.
    cacheInit(hardnessTotal > 0 && plantTotal > 0 ? "reference" : "fast"),
  );
}

async function handlePlantDetail(plantParam: string) {
  const key = parsePlantKey(plantParam);
  if (!key) {
    return NextResponse.json({ ok: false, error: "plant 參數格式不正確" }, { status: 400 });
  }

  try {
    const detail = await getWaterPlantQualityDetail(key.officeCode, key.plantCode);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "找不到這座淨水場" }, { status: 404 });
    }
    return NextResponse.json(
      {
        ok: true,
        plant: detail.plant,
        items: detail.items,
        sourceUpdatedOn: detail.sourceUpdatedOn,
        notice: PLANT_QUALITY_DISCLAIMER,
      },
      cacheInit("reference"),
    );
  } catch (error) {
    console.error("Error loading water plant detail in /api/tools/water-quality:", error);
    return NextResponse.json({ ok: false, error: "無法取得淨水場檢驗資料" }, { status: 500 });
  }
}
