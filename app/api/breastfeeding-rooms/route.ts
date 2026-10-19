import { NextRequest, NextResponse } from "next/server";
import { cacheInit } from "@/lib/server/http/cacheControl";
import { readTransientSeedJson } from "@/lib/server/db/transientSeed";
import { normalizeCountyName } from "@/lib/constants/taiwanDistricts";

export const runtime = "nodejs";

/**
 * 種子 JSON（約 1.5 MB）改成請求時才讀檔、短暫停留後釋放（#709）：原本是
 * `import ... from "@/data/breastfeeding-rooms-seed.json"`，整份文字會被打包進
 * server chunk，並在開機時就永久常駐。過去 18 天此路由只被打到 11 次。
 */
const SEED_FILE = "breastfeeding-rooms-seed.json";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get("county")?.trim();
    const keyword = searchParams.get("keyword")?.trim().toLowerCase();

    const breastfeedingSeed = readTransientSeedJson<any>(SEED_FILE);
    if (!breastfeedingSeed) {
      // 種子檔不在（部署缺檔）：這支路由沒有資料庫可退，回 503 並明確禁止快取，
      // 避免 CDN 把「空清單」當成正常結果存起來。讀檔失敗的原因已由讀取器寫入日誌。
      return NextResponse.json(
        { ok: false, error: "哺乳室資料暫時無法讀取，請稍後再試" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    let points = (breastfeedingSeed as any).points || [];

    if (county) {
      const normalizedCounty = normalizeCountyName(county);
      points = points.filter((p: any) => normalizeCountyName(p.county) === normalizedCounty);
    }

    if (keyword) {
      points = points.filter(
        (p: any) =>
          (p.name && p.name.toLowerCase().includes(keyword)) ||
          (p.address && p.address.toLowerCase().includes(keyword)),
      );
    }

    return NextResponse.json({
      ok: true,
      total: points.length,
      updatedAt: (breastfeedingSeed as any).updatedAt || null,
      points,
    }, cacheInit("reference"));
  } catch (error: any) {
    console.error("GET /api/breastfeeding-rooms error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "伺服器內部錯誤" },
      { status: 500 },
    );
  }
}
