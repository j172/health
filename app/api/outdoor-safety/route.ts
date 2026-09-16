import { NextRequest, NextResponse } from "next/server";
import { getOutdoorSafetyOverview, getCityOutdoorSafety } from "@/lib/server/outdoorSafety/queries";

export const revalidate = 180;
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");

    if (city) {
      const cityItem = await getCityOutdoorSafety(city);
      if (!cityItem) {
        return NextResponse.json({ error: "City not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, data: cityItem });
    }

    const result = await getOutdoorSafetyOverview();
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    console.error("OutdoorSafety API error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to calculate outdoor safety index" },
      { status: 500 }
    );
  }
}
