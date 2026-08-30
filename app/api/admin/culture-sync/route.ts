import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runCulturalShowsSync } from "@/lib/server/culture/ingestShows";
import { runPublicArtSync } from "@/lib/server/culture/ingestPublicArt";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";

    const body = (await request.json().catch(() => ({}))) as {
      publicArtRecords?: any[];
      records?: any[];
      showsRecords?: any[];
    };

    let showsResult: any = null;
    let publicArtResult: any = null;

    if (type === "shows" || type === "all") {
      showsResult = await runCulturalShowsSync();
    }

    if (type === "public-art" || type === "all") {
      const supplied = body.publicArtRecords || body.records;
      publicArtResult = await runPublicArtSync(supplied);
    }

    return NextResponse.json({
      ok: true,
      results: {
        shows: showsResult,
        publicArt: publicArtResult,
      },
    });
  } catch (error: any) {
    console.error("[Culture Sync Admin Error]", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to execute culture sync" },
      { status: 500 }
    );
  }
}

