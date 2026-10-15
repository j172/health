import { NextRequest, NextResponse } from "next/server";
import { searchDrugs, countSearchDrugs, getRecentDrugs, countDrugs, type DrugListItem } from "@/lib/server/drugs/queries";
import { getIngredientsByLicenseNo } from "@/lib/server/drugs/ingredientsQueries";
import {
  countDrugShortages,
  getDrugShortagesMeta,
  getShortagesByLicenseNo,
  getShortageStatusByLicense,
  searchDrugShortages,
} from "@/lib/server/drugs/shortageQueries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/**
 * `?view=shortages` serves the weekly-refreshed TFDA shortage list (issue
 * #670). Explicit Cache-Control, since an unlabeled /api/* response falls
 * through to the upstream's 30-minute default (see app/api/facilities/route.ts):
 * 5 minutes at the edge is plenty for weekly data. It is only attached to a
 * non-empty table — an empty answer (before the first sync, or a failed one)
 * must never be edge-cached, or a later successful sync would keep looking
 * like "0 筆".
 */
const SHORTAGES_CACHE_HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };

const MAX_KEYWORD_LENGTH = 100;

/** Mirrors PAGE_SIZE_OPTIONS in lib/hooks/usePagination.ts — kept as a literal list here so this route has no client-only import. */
const PAGE_SIZE_OPTIONS = [30, 50, 100];
const DEFAULT_PAGE_SIZE = 30;

const resolvePaging = (searchParams: URLSearchParams): { limit: number; offset: number } => {
  const pageSize = Number(searchParams.get("pageSize"));
  const limit = PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  return { limit, offset: (page - 1) * limit };
};

/** Adds `shortage` ("with_alternative" | "no_alternative" | null) to each drug — a lookup that cannot fail the search (see getShortageStatusByLicense). */
const withShortageStatus = async (drugs: DrugListItem[]) => {
  const statuses = await getShortageStatusByLicense(drugs.map((d) => d.license_no));
  return drugs.map((d) => ({ ...d, shortage: statuses.get(d.license_no) ?? null }));
};

const handleShortages = async (searchParams: URLSearchParams): Promise<NextResponse> => {
  const keyword = searchParams.get("keyword")?.trim().slice(0, MAX_KEYWORD_LENGTH) || null;
  const { limit, offset } = resolvePaging(searchParams);

  try {
    const [shortages, total, meta] = await Promise.all([
      searchDrugShortages(keyword, limit, offset),
      countDrugShortages(keyword),
      getDrugShortagesMeta(),
    ]);
    return NextResponse.json(
      { shortages, total, meta },
      { headers: meta.total > 0 ? SHORTAGES_CACHE_HEADERS : NO_CACHE_HEADERS },
    );
  } catch (error) {
    console.error("GET /api/drugs?view=shortages failed:", error);
    return NextResponse.json(
      { error: "查詢藥品短缺資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
};

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("view") === "shortages") {
    return handleShortages(request.nextUrl.searchParams);
  }

  const licenseNo = request.nextUrl.searchParams.get("licenseNo")?.trim();
  if (licenseNo) {
    try {
      const [ingredients, shortages] = await Promise.all([
        getIngredientsByLicenseNo(licenseNo),
        getShortagesByLicenseNo(licenseNo),
      ]);
      return NextResponse.json({ ingredients, shortages }, { headers: NO_CACHE_HEADERS });
    } catch (error) {
      console.error("GET /api/drugs?licenseNo failed:", error);
      return NextResponse.json(
        { error: "查詢藥品成分失敗" },
        { status: 502, headers: NO_CACHE_HEADERS },
      );
    }
  }

  const keyword = request.nextUrl.searchParams.get("keyword")?.trim();
  const { limit, offset } = resolvePaging(request.nextUrl.searchParams);

  try {
    const [drugs, total] = keyword
      ? await Promise.all([searchDrugs(keyword, limit, offset), countSearchDrugs(keyword)])
      : await Promise.all([getRecentDrugs(limit, offset), countDrugs()]);
    return NextResponse.json({ drugs: await withShortageStatus(drugs), total }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/drugs failed:", error);
    return NextResponse.json(
      { error: "查詢藥品資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}
