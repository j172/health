import { NextRequest, NextResponse } from "next/server";
import { searchNativeDict } from "@/lib/server/dictionary/service";
import type { NativeLanguage } from "@/lib/server/dictionary/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawLang = searchParams.get("lang");
    const lang: NativeLanguage = rawLang === "hakka" ? "hakka" : "twblg";
    const q = searchParams.get("q") || undefined;
    const dialect = searchParams.get("dialect") || undefined;
    const topic = searchParams.get("topic") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const result = await searchNativeDict({
      lang,
      q,
      dialect,
      topic,
      page: isNaN(page) ? 1 : page,
      limit: isNaN(limit) ? 20 : limit,
    });

    return NextResponse.json(
      { ok: true, ...result },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error: any) {
    console.error("[api/child-native-languages] Error querying dictionary:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to search native dictionary" },
      { status: 500 },
    );
  }
}
