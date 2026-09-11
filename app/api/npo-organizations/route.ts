import { NextRequest, NextResponse } from "next/server";
import {
  getRecentNpoOrganizations,
  countNpoOrganizations,
  searchNpoOrganizations,
  countSearchNpoOrganizations,
  getNpoOrganizationCities,
  getNpoOrganizationAttributes,
} from "@/lib/server/npoOrganizations/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const PAGE_SIZE_OPTIONS = [30, 50, 100];
const DEFAULT_PAGE_SIZE = 30;

const resolvePaging = (searchParams: URLSearchParams): { limit: number; offset: number } => {
  const pageSize = Number(searchParams.get("pageSize"));
  const limit = PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  return { limit, offset: (page - 1) * limit };
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (params.get("attributes") === "true") {
    try {
      const attributes = await getNpoOrganizationAttributes();
      return NextResponse.json({ attributes }, { headers: NO_CACHE_HEADERS });
    } catch (error) {
      console.error("GET /api/npo-organizations?attributes=true failed:", error);
      return NextResponse.json(
        { error: "查詢機構屬性清單失敗" },
        { status: 502, headers: NO_CACHE_HEADERS },
      );
    }
  }

  if (params.get("cities") === "true") {
    try {
      const cities = await getNpoOrganizationCities();
      return NextResponse.json({ cities }, { headers: NO_CACHE_HEADERS });
    } catch (error) {
      console.error("GET /api/npo-organizations?cities=true failed:", error);
      return NextResponse.json(
        { error: "查詢縣市清單失敗" },
        { status: 502, headers: NO_CACHE_HEADERS },
      );
    }
  }

  const keyword = params.get("keyword")?.trim() || undefined;
  const city = params.get("city")?.trim() || undefined;
  const attribute = params.get("attribute")?.trim() || undefined;
  const hasProducts = params.get("hasProducts") === "true";
  const hasBadges = params.get("hasBadges") === "true";
  const { limit, offset } = resolvePaging(params);

  try {
    const hasFilter =
      keyword ||
      (city && city !== "全部縣市") ||
      (attribute && attribute !== "全部屬性") ||
      hasProducts ||
      hasBadges;

    const [items, total] = hasFilter
      ? await Promise.all([
          searchNpoOrganizations({ keyword, city, attribute, hasProducts, hasBadges, limit, offset }),
          countSearchNpoOrganizations({ keyword, city, attribute, hasProducts, hasBadges }),
        ])
      : await Promise.all([
          getRecentNpoOrganizations(limit, offset),
          countNpoOrganizations(hasProducts, hasBadges),
        ]);

    return NextResponse.json({ items, total }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/npo-organizations failed:", error);
    return NextResponse.json(
      { error: "查詢公益組織 (NPO) 名冊失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}
