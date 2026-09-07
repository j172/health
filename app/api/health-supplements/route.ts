import { NextRequest, NextResponse } from "next/server";
import { searchHealthSupplements } from "@/lib/server/food/healthSupplements";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("keyword")?.trim() || undefined;
  const activeOnly = request.nextUrl.searchParams.get("activeOnly") !== "false";
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const results = await searchHealthSupplements({ keyword, activeOnly, limit });
    return NextResponse.json({ results });
  } catch (error) {
    console.error("GET /api/health-supplements failed:", error);
    return NextResponse.json({ error: "查詢健康食品資料失敗" }, { status: 502 });
  }
}
