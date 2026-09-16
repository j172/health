import { NextRequest, NextResponse } from "next/server";
import { getFoodSafetyOverview, getFoodSafetyDetail } from "@/lib/server/foodSafety/queries";

export const revalidate = 300;
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const crop = searchParams.get("crop");
    const q = searchParams.get("q") || undefined;
    const category = searchParams.get("category") || undefined;
    const risk = searchParams.get("risk") || undefined;

    if (crop) {
      const detail = await getFoodSafetyDetail(crop);
      if (!detail) {
        return NextResponse.json({ error: "Crop not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, data: detail });
    }

    const result = await getFoodSafetyOverview({ q, category, risk });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    console.error("FoodSafety API error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch food safety data" },
      { status: 500 }
    );
  }
}
