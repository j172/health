import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getHeritageMapData } from "@/lib/server/culture/queries";

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 minutes — the source datasets sync infrequently (BOCH open data changes slowly)

function getHeritageSeedFallback() {
  try {
    const seedPath = path.join(process.cwd(), "data", "heritage-map-seed.json");
    if (!fs.existsSync(seedPath)) return null;
    const raw = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
    if (raw.points && raw.points.length > 0) {
      return raw;
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

