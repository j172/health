import { NextResponse } from "next/server";
import { getDisasterMapData } from "@/lib/server/disaster/queries";

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 minutes — the source datasets sync at most daily

export async function GET() {
  try {
    const data = await getDisasterMapData();
    return NextResponse.json({ ok: true, ...data });
  } catch (error: any) {
    console.error("GET /api/disaster-map error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to load disaster map data", points: [], updatedAt: null },
      { status: 500 },
    );
  }
}
