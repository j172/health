import { NextResponse } from "next/server";
import { cacheInit } from "@/lib/server/http/cacheControl";
import { searchNewsItems } from "@/lib/server/news/queries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ results: [] }, cacheInit("none"));
  }

  try {
    const results = await searchNewsItems(q, 10);
    return NextResponse.json({ results }, cacheInit("none"));
  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json({ results: [], error: "Search failed" }, { status: 500 });
  }
}
