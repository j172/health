import { NextResponse } from "next/server";
import { getDengueMapData } from "@/lib/server/dengue/queries";

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 minutes — the source dataset syncs at most daily

export async function GET() {
  try {
    const data = await getDengueMapData();
    return NextResponse.json({ ok: true, ...data });
  } catch (error: any) {
    console.error("GET /api/dengue-map error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to load dengue vector survey data", points: [], updatedAt: null },
      { status: 500 },
    );
  }
}
