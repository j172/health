import { NextResponse } from "next/server";
import { getSubmarineCableStatus } from "@/lib/server/resilience/submarineCableService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getSubmarineCableStatus();
  return NextResponse.json(
    { success: true, data },
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
      },
    },
  );
}
