import { NextRequest, NextResponse } from "next/server";
import {
  getRecentTaxOrganizations,
  searchTaxOrganizations,
  getTaxOrganizationCities,
} from "@/lib/server/taxOrganizations/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (params.get("cities") === "true") {
    try {
      const cities = await getTaxOrganizationCities();
      return NextResponse.json({ cities }, { headers: NO_CACHE_HEADERS });
    } catch (error) {
      console.error("GET /api/tax-organizations?cities=true failed:", error);
      return NextResponse.json(
        { error: "查詢縣市清單失敗" },
        { status: 502, headers: NO_CACHE_HEADERS },
      );
    }
  }

  const keyword = params.get("keyword")?.trim() || undefined;
  const city = params.get("city")?.trim() || undefined;

  try {
    const items =
      keyword || (city && city !== "全部縣市")
        ? await searchTaxOrganizations({ keyword, city, limit: 50 })
        : await getRecentTaxOrganizations(30);

    return NextResponse.json({ items }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/tax-organizations failed:", error);
    return NextResponse.json(
      { error: "查詢非營利組織名冊失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}

