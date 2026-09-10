import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runCulturalShowsSync } from "@/lib/server/culture/ingestShows";
import { runNpoActivitiesSync } from "@/lib/server/culture/ingestNpoActivities";
import { runPresidentialVisitSync } from "@/lib/server/culture/ingestPresidentialVisit";
import { runPublicArtSync } from "@/lib/server/culture/ingestPublicArt";
import { runHeritageAssetsSync } from "@/lib/server/culture/ingestHeritageAssets";

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
    let npoResult: any = null;
    let presidentialResult: any = null;
    let publicArtResult: any = null;
    let heritageResult: any = null;

    if (type === "shows" || type === "all") {
      showsResult = await runCulturalShowsSync();
    }

    if (type === "npo" || type === "shows" || type === "all") {
      npoResult = await runNpoActivitiesSync();
    }

    if (type === "presidential" || type === "shows" || type === "all") {
      presidentialResult = await runPresidentialVisitSync();
    }

    if (type === "public-art" || type === "all") {
      const supplied = body.publicArtRecords || body.records;
      publicArtResult = await runPublicArtSync(supplied);
    }

    if (type === "heritage" || type === "all") {
      heritageResult = await runHeritageAssetsSync();
    }

    return NextResponse.json({
      ok: true,
      results: {
        shows: showsResult,
        npo: npoResult,
        presidential: presidentialResult,
        publicArt: publicArtResult,
        heritage: heritageResult,
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

