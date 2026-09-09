import { NextResponse } from "next/server";
import { getHeritageMapData } from "@/lib/server/culture/queries";

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 minutes — the source datasets sync infrequently (BOCH open data changes slowly)

export async function GET() {
  try {
    const data = await getHeritageMapData();
    return NextResponse.json({ ok: true, ...data });
  } catch (error: any) {
    console.error("GET /api/heritage-map error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to load heritage map data", points: [], updatedAt: null },
      { status: 500 },
    );
  }
}
