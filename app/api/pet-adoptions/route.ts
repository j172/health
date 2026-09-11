import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { searchPetAdoptions } from "@/lib/server/petAdoption/queries";
import type { PetAdoptionItem } from "@/lib/server/petAdoption/types";
import petAdoptionsSeed from "@/data/pet-adoptions-seed.json";

export const runtime = "nodejs";

function getSeedFallback(
  kind?: string,
  sex?: string,
  bodytype?: string,
  city?: string,
  keyword?: string,
  page = 1,
  limit = 24,
): { items: PetAdoptionItem[]; total: number; totalAll: number } {
  try {
    let raw = (Array.isArray(petAdoptionsSeed) ? petAdoptionsSeed : null) as PetAdoptionItem[] | null;
    if (!raw || raw.length === 0) {
      const seedPath = path.join(process.cwd(), "data", "pet-adoptions-seed.json");
      if (fs.existsSync(seedPath)) {
        raw = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as PetAdoptionItem[];
      }
    }
    if (!raw || raw.length === 0) return { items: [], total: 0, totalAll: 0 };
    const totalAll = raw.length;

    let filtered = raw;
    if (kind && kind !== "all") {
      filtered = filtered.filter((x) => x.animal_kind === kind);
    }
    if (sex && sex !== "all") {
      filtered = filtered.filter((x) => x.animal_sex === sex);
    }
    if (bodytype && bodytype !== "all") {
      filtered = filtered.filter((x) => x.animal_bodytype === bodytype);
    }
    if (city && city !== "all") {
      const normCity = city.replace("台", "臺");
      filtered = filtered.filter((x) => x.city?.includes(normCity) || x.shelter_address?.includes(normCity));
    }
    if (keyword) {
      const kw = keyword.toLowerCase();
      filtered = filtered.filter(
        (x) =>
          x.animal_variety?.toLowerCase().includes(kw) ||
          x.shelter_name?.toLowerCase().includes(kw) ||
          x.animal_remark?.toLowerCase().includes(kw) ||
          x.animal_foundplace?.toLowerCase().includes(kw),
      );
    }

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const items = filtered.slice(offset, offset + limit);
    return { items, total, totalAll };
  } catch (err) {
    console.error("Failed to load pet adoptions seed fallback:", err);
    return { items: [], total: 0, totalAll: 0 };
  }
}

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
    if (data.totalAll > 0) {
      return NextResponse.json(data);
    }
    // If DB is empty, use bundled seed fallback
    const fallback = getSeedFallback(kind, sex, bodytype, city, keyword, page, limit);
    return NextResponse.json(fallback);
  } catch (error) {
    console.warn("GET /api/pet-adoptions DB query failed, falling back to seed:", error);
    const fallback = getSeedFallback(kind, sex, bodytype, city, keyword, page, limit);
    if (fallback.totalAll > 0) {
      return NextResponse.json(fallback);
    }
    return NextResponse.json({ error: "查詢認領養資料失敗" }, { status: 500 });
  }
}

