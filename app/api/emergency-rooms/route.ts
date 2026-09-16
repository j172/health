import { NextResponse } from "next/server";
import { getEmergencyRoomOverview, getSidebarEmergencyHighlights } from "@/lib/server/emergencyRooms/queries";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
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
}
