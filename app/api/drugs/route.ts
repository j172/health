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
import {
  countDrugRecalls,
  getDrugRecallsMeta,
  getRecallsByLicenseNo,
  getRecallStatusByLicense,
  searchDrugRecalls,
} from "@/lib/server/drugs/recallQueries";
import { RECALL_LEVELS, type RecallLevel } from "@/lib/server/drugs/sources/tfdaDrugRecalls";

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

/**
 * `?view=recalls` serves the weekly-refreshed TFDA recalled-drug register (issue
 * #675). Same reasoning as the shortages headers above: an explicit
 * Cache-Control (never the upstream's unlabeled 30-minute default), and only
 * on a non-empty table.
 */
const RECALLS_CACHE_HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };

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

/**
 * Adds `shortage` ("with_alternative" | "no_alternative" | null) and `recall`
 * ({ count, latest_recalled_on, worst_level } | null) to each drug. Both
 * lookups swallow their own errors (see getShortageStatusByLicense /
 * getRecallStatusByLicense), so neither can fail the drug search itself.
 */
const withStatusMarkers = async (drugs: DrugListItem[]) => {
  const licenseNos = drugs.map((d) => d.license_no);
  const [shortages, recalls] = await Promise.all([getShortageStatusByLicense(licenseNos), getRecallStatusByLicense(licenseNos)]);
  return drugs.map((d) => ({ ...d, shortage: shortages.get(d.license_no) ?? null, recall: recalls.get(d.license_no) ?? null }));
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

/** `?level=` accepts only the four normalized values; anything else means "no level filter". */
const resolveRecallLevel = (raw: string | null): RecallLevel | null =>
  raw !== null && (RECALL_LEVELS as readonly string[]).includes(raw) ? (raw as RecallLevel) : null;

const handleRecalls = async (searchParams: URLSearchParams): Promise<NextResponse> => {
  const keyword = searchParams.get("keyword")?.trim().slice(0, MAX_KEYWORD_LENGTH) || null;
  const level = resolveRecallLevel(searchParams.get("level"));
  const { limit, offset } = resolvePaging(searchParams);

  try {
    const filter = { keyword, level };
    const [recalls, total, meta] = await Promise.all([
      searchDrugRecalls(filter, limit, offset),
      countDrugRecalls(filter),
      getDrugRecallsMeta(),
    ]);
    return NextResponse.json(
      { recalls, total, meta },
      { headers: meta.total > 0 ? RECALLS_CACHE_HEADERS : NO_CACHE_HEADERS },
    );
  } catch (error) {
    console.error("GET /api/drugs?view=recalls failed:", error);
    return NextResponse.json(
      { error: "查詢回收藥品資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
};

export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view");
  if (view === "shortages") {
    return handleShortages(request.nextUrl.searchParams);
  }
  if (view === "recalls") {
    return handleRecalls(request.nextUrl.searchParams);
  }

  const licenseNo = request.nextUrl.searchParams.get("licenseNo")?.trim();
  if (licenseNo) {
    try {
      const [ingredients, shortages, recalls] = await Promise.all([
        getIngredientsByLicenseNo(licenseNo),
        getShortagesByLicenseNo(licenseNo),
        getRecallsByLicenseNo(licenseNo),
      ]);
      return NextResponse.json({ ingredients, shortages, recalls }, { headers: NO_CACHE_HEADERS });
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
    return NextResponse.json({ drugs: await withStatusMarkers(drugs), total }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/drugs failed:", error);
    return NextResponse.json(
      { error: "查詢藥品資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}
