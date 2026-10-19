import { NextResponse } from "next/server";
import { getHeritageMapData } from "@/lib/server/culture/queries";
import { readTransientSeedJson } from "@/lib/server/db/transientSeed";

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 minutes — the source datasets sync infrequently (BOCH open data changes slowly)

/**
 * 後備種子（約 1.5 MB）改成「資料庫沒資料或查詢失敗時才讀檔」，並在短暫停留後釋放（#709）。
 * 原本是靜態 `import ... "@/data/heritage-map-seed.json"`（文字永久常駐於 server chunk）
 * 再加一份同檔的 fs 後備；兩者是同一個檔案，所以合併成一次按需讀取，結果不變。
 */
const SEED_FILE = "heritage-map-seed.json";

function getHeritageSeedFallback() {
  try {
    const seed = readTransientSeedJson<any>(SEED_FILE);
    if (seed && Array.isArray(seed.points) && seed.points.length > 0) {
      return seed;
    }
    return null;
  } catch (err) {
    console.warn("Failed to load heritage map seed fallback:", err);
    return null;
  }
}

export async function GET() {
  try {
    const data = await getHeritageMapData();
    if (data.points && data.points.length > 0) {
      return NextResponse.json({ ok: true, ...data });
    }
    // If DB has 0 points, use bundled seed fallback
    const fallback = getHeritageSeedFallback();
    if (fallback) {
      return NextResponse.json(fallback);
    }
    return NextResponse.json({ ok: true, ...data });
  } catch (error: any) {
    console.warn("GET /api/heritage-map error, attempting seed fallback:", error);
    const fallback = getHeritageSeedFallback();
    if (fallback) {
      return NextResponse.json(fallback);
    }
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to load heritage map data", points: [], updatedAt: null },
      { status: 500 },
    );
  }
}

