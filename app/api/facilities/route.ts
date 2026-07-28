import { NextRequest, NextResponse } from "next/server";
import { searchFacilities } from "@/lib/server/facilities/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const facilityType = params.get("type")?.trim();
  if (!facilityType) {
    return NextResponse.json({ error: "Missing required 'type' query param" }, { status: 400 });
  }

  const keyword = params.get("keyword")?.trim() || undefined;
  const lat = params.get("lat") ? Number(params.get("lat")) : undefined;
  const lng = params.get("lng") ? Number(params.get("lng")) : undefined;
  const radiusMeters = params.get("radius") ? Number(params.get("radius")) : undefined;

  try {
    const facilities = await searchFacilities({ facilityType, keyword, lat, lng, radiusMeters });
    return NextResponse.json({ facilities });
  } catch (error) {
    console.error("GET /api/facilities failed:", error);
    return NextResponse.json({ error: "查詢機構資料失敗" }, { status: 502 });
  }
}
