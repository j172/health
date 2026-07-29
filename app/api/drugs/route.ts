import { NextRequest, NextResponse } from "next/server";
import { searchDrugs } from "@/lib/server/drugs/queries";
import { getIngredientsByLicenseNo } from "@/lib/server/drugs/ingredientsQueries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const licenseNo = request.nextUrl.searchParams.get("licenseNo")?.trim();
  if (licenseNo) {
    try {
      const ingredients = await getIngredientsByLicenseNo(licenseNo);
      return NextResponse.json({ ingredients });
    } catch (error) {
      console.error("GET /api/drugs?licenseNo failed:", error);
      return NextResponse.json({ error: "查詢藥品成分失敗" }, { status: 502 });
    }
  }

  const keyword = request.nextUrl.searchParams.get("keyword")?.trim();
  if (!keyword) {
    return NextResponse.json({ error: "Missing required 'keyword' or 'licenseNo' query param" }, { status: 400 });
  }

  try {
    const drugs = await searchDrugs(keyword);
    return NextResponse.json({ drugs });
  } catch (error) {
    console.error("GET /api/drugs failed:", error);
    return NextResponse.json({ error: "查詢藥品資料失敗" }, { status: 502 });
  }
}
