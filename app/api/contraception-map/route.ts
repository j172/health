import { NextRequest, NextResponse } from "next/server";
import { cacheInit } from "@/lib/server/http/cacheControl";
import { readTransientSeedJson } from "@/lib/server/db/transientSeed";

export const runtime = "nodejs";

/**
 * 種子 JSON（約 0.5 MB）改成請求時才讀檔、短暫停留後釋放（#709），不再用
 * `import ... from "@/data/contraception-map-seed.json"` 打包進 server chunk。
 */
const SEED_FILE = "contraception-map-seed.json";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category")?.trim(); // "clinic" | "pharmacy" | "all"
    const city = searchParams.get("city")?.trim();
    const keyword = searchParams.get("keyword")?.trim().toLowerCase();

    const contraceptionSeed = readTransientSeedJson<any>(SEED_FILE);
    if (!contraceptionSeed) {
      // 種子檔不在（部署缺檔）：沒有其他資料來源，回 503 並禁止快取（原因見讀取器日誌）。
      return NextResponse.json(
        { ok: false, error: "避孕諮詢據點資料暫時無法讀取，請稍後再試" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    let points = (contraceptionSeed as any).points || [];

    if (category && category !== "all") {
      points = points.filter((p: any) => p.category === category);
    }

    if (city && city !== "全部縣市") {
      points = points.filter((p: any) => p.city === city || (p.address && p.address.includes(city)));
    }

    if (keyword) {
      points = points.filter(
        (p: any) =>
          (p.name && p.name.toLowerCase().includes(keyword)) ||
          (p.address && p.address.toLowerCase().includes(keyword)) ||
          (p.categoryLabel && p.categoryLabel.toLowerCase().includes(keyword)),
      );
    }

    return NextResponse.json({
      ok: true,
      total: points.length,
      clinicsCount: (contraceptionSeed as any).clinicsCount || 88,
      pharmaciesCount: (contraceptionSeed as any).pharmaciesCount || 798,
      updatedAt: (contraceptionSeed as any).updatedAt || null,
      points,
    }, cacheInit("reference"));
  } catch (error: any) {
    console.error("GET /api/contraception-map error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "伺服器內部錯誤" },
      { status: 500 },
    );
  }
}
