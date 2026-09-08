import { NextRequest, NextResponse } from "next/server";
import { AQX_DATASETS, getAqxDatasetMeta } from "@/lib/server/aqx/datasets";
import { getAqxWidePage, getAqxNarrowPage } from "@/lib/server/aqx/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

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

/** GET /api/aqx?dataset=aqx_p_15&keyword=&page=&pageSize= — issue #131's eight AQX_* datasets, one route shared across both payload shapes. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const datasetCode = params.get("dataset")?.trim();
  const keyword = params.get("keyword")?.trim() || undefined;
  const { limit, offset } = resolvePaging(params);

  if (!datasetCode) {
    return NextResponse.json(
      { error: "Missing 'dataset' query param", datasets: AQX_DATASETS },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const meta = getAqxDatasetMeta(datasetCode);
  if (!meta) {
    return NextResponse.json(
      { error: `Unknown AQX dataset code: ${datasetCode}`, datasets: AQX_DATASETS },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  try {
    const { rows, total } =
      meta.shape === "wide"
        ? await getAqxWidePage({ datasetCode, keyword, limit, offset })
        : await getAqxNarrowPage({ datasetCode, keyword, limit, offset });

    return NextResponse.json({ meta, rows, total }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error(`GET /api/aqx?dataset=${datasetCode} failed:`, error);
    return NextResponse.json(
      { error: "查詢空氣品質監測資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}
