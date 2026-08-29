import { NextRequest, NextResponse } from "next/server";
import { countFacilities, searchFacilities } from "@/lib/server/facilities/queries";

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
  const serviceItem = params.get("category")?.trim() || undefined;
  const sortParam = params.get("sort");
  const sort = sortParam === "distance" || sortParam === "name" || sortParam === "category" ? sortParam : undefined;

  try {
    // `total` deliberately takes nothing but `facilityType` — it is the size of the whole
    // dataset, not of this result set. The list UI prints the two side by side
    // (顯示 N 筆／全台共 M 筆) so that a nearby search returning a handful of rows, which is
    // normal for a geographically concentrated dataset, can't be misread as the dataset
    // itself being nearly empty. Passing keyword/radius/category in here would collapse
    // `total` back onto `facilities.length` and destroy the only comparison that matters.
    const [facilities, total] = await Promise.all([
      searchFacilities({ facilityType, keyword, lat, lng, radiusMeters, serviceItem, sort }),
      countFacilities(facilityType),
    ]);
    return NextResponse.json({ facilities, total });
  } catch (error) {
    console.error("GET /api/facilities failed:", error);
    return NextResponse.json({ error: "查詢機構資料失敗" }, { status: 502 });
  }
}
