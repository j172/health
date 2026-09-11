import { NextRequest, NextResponse } from "next/server";
import contraceptionSeed from "@/data/contraception-map-seed.json";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category")?.trim(); // "clinic" | "pharmacy" | "all"
    const city = searchParams.get("city")?.trim();
    const keyword = searchParams.get("keyword")?.trim().toLowerCase();

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
    });
  } catch (error: any) {
    console.error("GET /api/contraception-map error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "伺服器內部錯誤" },
      { status: 500 },
    );
  }
}
