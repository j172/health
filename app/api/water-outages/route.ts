import { NextResponse } from "next/server";
import { getWaterOutages, type WaterOutageItem } from "@/lib/server/water/queries";

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 minutes

export type { WaterOutageItem };

export async function GET() {
  try {
    const data = await getWaterOutages(50);
    return NextResponse.json({
      ok: true,
      totalCount: data.totalCount,
      outages: data.outages,
      updatedAt: data.updatedAt,
    });
  } catch (error: any) {
    console.error("GET /api/water-outages error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to load water outages", outages: [] },
      { status: 500 }
    );
  }
}
