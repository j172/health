import { NextRequest, NextResponse } from "next/server";
import { searchPetAdoptions } from "@/lib/server/petAdoption/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind")?.trim() || undefined;
  const sex = params.get("sex")?.trim() || undefined;
  const bodytype = params.get("bodytype")?.trim() || undefined;
  const city = params.get("city")?.trim() || undefined;
  const keyword = params.get("keyword")?.trim() || undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const rawLimit = Number(params.get("limit")) || 24;
  const limit = Math.min(Math.max(1, rawLimit), 60);

  try {
    const data = await searchPetAdoptions({ kind, sex, bodytype, city, keyword, page, limit });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/pet-adoptions failed:", error);
    return NextResponse.json({ error: "查詢認領養資料失敗" }, { status: 500 });
  }
}
