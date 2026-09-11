import { NextRequest, NextResponse } from "next/server";
import breastfeedingSeed from "@/data/breastfeeding-rooms-seed.json";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get("county")?.trim();
    const keyword = searchParams.get("keyword")?.trim().toLowerCase();

    let points = (breastfeedingSeed as any).points || [];

    if (county) {
      points = points.filter((p: any) => p.county === county);
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
    });
  } catch (error: any) {
    console.error("GET /api/breastfeeding-rooms error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "伺服器內部錯誤" },
      { status: 500 },
    );
  }
}
