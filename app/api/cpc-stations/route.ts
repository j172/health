import { NextRequest, NextResponse } from "next/server";
import { searchCpcStations } from "@/lib/server/cpc/stations";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get("keyword") || undefined;
    const servicesRaw = searchParams.get("services");
    const services = servicesRaw ? servicesRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

    const latParam = searchParams.get("lat");
    const lngParam = searchParams.get("lng");
    const lat = latParam ? parseFloat(latParam) : undefined;
    const lng = lngParam ? parseFloat(lngParam) : undefined;

    const radiusMeters = searchParams.get("radius") ? parseInt(searchParams.get("radius")!, 10) : 50000;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 600;

    const data = await searchCpcStations({
      keyword,
      services,
      lat: !isNaN(lat as number) ? lat : undefined,
      lng: !isNaN(lng as number) ? lng : undefined,
      radiusMeters,
      limit,
    });

    return NextResponse.json({ ok: true, ...data });
  } catch (error: any) {
    console.error("GET /api/cpc-stations error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to search CPC stations" },
      { status: 500 },
    );
  }
}
