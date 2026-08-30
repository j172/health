import { NextResponse } from "next/server";
import { searchPublicArt } from "@/lib/server/culture/queries";
import { type PublicArtItem } from "@/lib/server/culture/types";

export const dynamic = "force-dynamic";

export type { PublicArtItem };

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = (searchParams.get("keyword") || "").trim();
    const city = (searchParams.get("city") || "").trim();
    const latParam = searchParams.get("lat");
    const lngParam = searchParams.get("lng");
    const radiusKm = parseFloat(searchParams.get("radius") || "50");
    const limit = parseInt(searchParams.get("limit") || "200", 10);

    const userLat = latParam ? parseFloat(latParam) : null;
    const userLng = lngParam ? parseFloat(lngParam) : null;

    const result = await searchPublicArt({
      keyword: keyword || undefined,
      city: city && city !== "全部縣市" ? city : undefined,
      lat: userLat && !isNaN(userLat) ? userLat : null,
      lng: userLng && !isNaN(userLng) ? userLng : null,
      radiusKm: isNaN(radiusKm) ? 50 : radiusKm,
      limit: isNaN(limit) ? 200 : limit,
    });

    return NextResponse.json({
      ok: true,
      count: result.items.length,
      totalMatched: result.totalMatched,
      items: result.items,
      updatedAt: result.updatedAt,
    });
  } catch (error: any) {
    console.error("[Public art API error]:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch public art" },
      { status: 500 }
    );
  }
}
