import { NextRequest, NextResponse } from "next/server";
import { searchDrugs, getRecentDrugs } from "@/lib/server/drugs/queries";
import { getIngredientsByLicenseNo } from "@/lib/server/drugs/ingredientsQueries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(request: NextRequest) {
  const licenseNo = request.nextUrl.searchParams.get("licenseNo")?.trim();
  if (licenseNo) {
    try {
      const ingredients = await getIngredientsByLicenseNo(licenseNo);
      return NextResponse.json({ ingredients }, { headers: NO_CACHE_HEADERS });
    } catch (error) {
      console.error("GET /api/drugs?licenseNo failed:", error);
      return NextResponse.json(
        { error: "查詢藥品成分失敗" },
        { status: 502, headers: NO_CACHE_HEADERS },
      );
    }
  }

  const keyword = request.nextUrl.searchParams.get("keyword")?.trim();

  try {
    const drugs = keyword ? await searchDrugs(keyword) : await getRecentDrugs(30);
    return NextResponse.json({ drugs }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/drugs failed:", error);
    return NextResponse.json(
      { error: "查詢藥品資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}
