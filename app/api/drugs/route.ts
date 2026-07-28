import { NextRequest, NextResponse } from "next/server";
import { searchDrugs } from "@/lib/server/drugs/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("keyword")?.trim();
  if (!keyword) {
    return NextResponse.json({ error: "Missing required 'keyword' query param" }, { status: 400 });
  }

  try {
    const drugs = await searchDrugs(keyword);
    return NextResponse.json({ drugs });
  } catch (error) {
    console.error("GET /api/drugs failed:", error);
    return NextResponse.json({ error: "查詢藥品資料失敗" }, { status: 502 });
  }
}
