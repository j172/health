import { NextRequest, NextResponse } from "next/server";
import { getBorderFoodRejectionsPage } from "@/lib/server/borderFood/queries";
import type { BorderFoodRejectionFilters } from "@/lib/server/borderFood/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Mirrors PAGE_SIZE_OPTIONS in lib/hooks/usePagination.ts — kept as a literal list so this route has no client-only import. */
const PAGE_SIZE_OPTIONS = [30, 50, 100];
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE = 10_000;

// The upstream list refreshes weekly and the table is only written by a weekly
// cron, so 10 minutes at the edge is plenty. Set explicitly: an un-labelled
// /api/* route falls through to the origin's mystery 30-minute default (see
// the note above FACILITIES_CACHE_HEADERS in app/api/facilities/route.ts).
const DATA_CACHE_HEADERS = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" };
// Errors and an EMPTY table must never be edge-cached: right after a deploy the
// table is empty until the first sync, and caching that "0 筆" at Cloudflare is
// exactly the false "no data" incident this site already had once.
const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const readText = (params: URLSearchParams, name: string, maxLength: number): string | undefined => {
  const value = params.get(name)?.trim();
  return value ? value.slice(0, maxLength) : undefined;
};

const readDate = (params: URLSearchParams, name: string): string | undefined => {
  const value = params.get(name)?.trim();
  return value && ISO_DATE.test(value) ? value : undefined;
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const filters: BorderFoodRejectionFilters = {
    origin: readText(params, "origin", 64),
    reason: readText(params, "reason", 255),
    q: readText(params, "q", 100),
    from: readDate(params, "from"),
    to: readDate(params, "to"),
  };

  const pageSizeRaw = Number(params.get("pageSize"));
  const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw) ? pageSizeRaw : DEFAULT_PAGE_SIZE;
  const pageRaw = Number(params.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, MAX_PAGE) : 1;

  try {
    const data = await getBorderFoodRejectionsPage(filters, page, pageSize);
    return NextResponse.json(
      { ok: true, data },
      { headers: data.facets.total > 0 ? DATA_CACHE_HEADERS : NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("GET /api/food-safety/border-rejections failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch border-rejected food data" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
