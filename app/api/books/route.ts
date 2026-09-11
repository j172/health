import { NextRequest, NextResponse } from "next/server";
import { getLatestBooks } from "@/lib/server/books/service";
import type { BookPlatform, BookItem } from "@/lib/server/books/types";
import latestBooksSeed from "@/data/latest-books-seed.json";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = (searchParams.get("platform") || undefined) as BookPlatform | undefined;
    const categoryId = searchParams.get("categoryId") || searchParams.get("category") || undefined;
    const search = searchParams.get("q") || searchParams.get("search") || undefined;
    const sortBy = (searchParams.get("sortBy") || undefined) as
      | "ranking"
      | "publishDate"
      | "priceAsc"
      | "priceDesc"
      | undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "24", 10);

    const fallbackBooks = ((latestBooksSeed as any)?.books || []) as BookItem[];

    const result = await getLatestBooks(
      {
        platform,
        categoryId,
        search,
        sortBy,
        page: isNaN(page) ? 1 : page,
        limit: isNaN(limit) ? 24 : limit,
      },
      fallbackBooks,
    );

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error: any) {
    console.error("[api/books] Error fetching latest books:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch latest books" },
      { status: 500 },
    );
  }
}
