import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { ensureSchema } from "@/lib/server/db/mysql";
import { runCulturalShowsSync } from "@/lib/server/culture/ingestShows";
import { runNpoActivitiesSync } from "@/lib/server/culture/ingestNpoActivities";
import { runPresidentialVisitSync } from "@/lib/server/culture/ingestPresidentialVisit";
import { runPublicArtSync } from "@/lib/server/culture/ingestPublicArt";
import { runHeritageAssetsSync } from "@/lib/server/culture/ingestHeritageAssets";
import { runKumaEventsSync } from "@/lib/server/culture/ingestKumaEvents";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    // issue #549: this route never called ensureSchema(), so the
    // cultural_events ALTER (title_en/description_en/extra_json, added
    // 2026-09-11) never ran against production — every write here failed
    // with "Unknown column 'extra_json'" until this call was added.
    await ensureSchema();

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
    let kumaResult: any = null;

    if (type === "shows" || type === "all") {
      showsResult = await runCulturalShowsSync();
    }

    if (type === "npo" || type === "shows" || type === "all") {
      npoResult = await runNpoActivitiesSync();
    }

    if (type === "kuma" || type === "npo" || type === "shows" || type === "all") {
      kumaResult = await runKumaEventsSync();
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
        kuma: kumaResult,
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

