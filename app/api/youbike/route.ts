import { NextRequest, NextResponse } from "next/server";
import { searchYouBikeStations } from "@/lib/server/youbike/queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cityCode = searchParams.get("city") || undefined;
  const district = searchParams.get("district") || undefined;
  const keyword = searchParams.get("keyword") || undefined;
  const latStr = searchParams.get("lat");
  const lngStr = searchParams.get("lng");
  const radiusStr = searchParams.get("radius");
  const limitStr = searchParams.get("limit");

  const lat = latStr ? parseFloat(latStr) : undefined;
  const lng = lngStr ? parseFloat(lngStr) : undefined;
  const radiusMeters = radiusStr ? parseInt(radiusStr, 10) : undefined;
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  try {
    const result = await searchYouBikeStations({
      cityCode,
      district,
      keyword,
      lat,
      lng,
      radiusMeters,
      limit,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Error in /api/youbike:", error);
    return NextResponse.json({ ok: false, error: "無法取得 YouBike 站點資訊" }, { status: 500 });
  }
}
