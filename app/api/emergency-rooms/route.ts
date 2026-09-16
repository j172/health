import { NextResponse } from "next/server";
import { getEmergencyRoomOverview, getSidebarEmergencyHighlights } from "@/lib/server/emergencyRooms/queries";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const widget = searchParams.get("widget");

    if (widget === "true") {
      const city = searchParams.get("city") || "TPE";
      const data = await getSidebarEmergencyHighlights(city);
      return NextResponse.json({ ok: true, ...data });
    }

    const cityCode = searchParams.get("city") || undefined;
    const keyword = searchParams.get("keyword") || undefined;
    const onlyCritical = searchParams.get("critical") === "true";
    const onlyFullReported = searchParams.get("full") === "true";
    const latStr = searchParams.get("lat");
    const lngStr = searchParams.get("lng");
    const lat = latStr ? parseFloat(latStr) : undefined;
    const lng = lngStr ? parseFloat(lngStr) : undefined;

    const result = await getEmergencyRoomOverview({
      cityCode,
      keyword,
      onlyCritical,
      onlyFullReported,
      lat,
      lng,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in /api/emergency-rooms:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "無法取得急診即時資訊",
        totalHospitals: 0,
        criticalCount: 0,
        busyCount: 0,
        normalCount: 0,
        fullReportedCount: 0,
        updatedAt: new Date().toISOString(),
        items: [],
      },
      { status: 500 }
    );
  }
}
