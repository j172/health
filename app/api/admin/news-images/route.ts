import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { assignMissingNewsCardImages, clearPixabayApiCache, clearAllNewsCardImages } from "@/lib/server/news/cardImages";
import {
  attachCardImageFromUrl,
  backfillMissingImagesFromOpenGraph,
  listMissingCardImageTargets,
} from "@/lib/server/news/backfillOgImages";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      limit?: unknown;
      clearCache?: unknown;
      clearCardImages?: unknown;
      /** Server-side og:image pull (shared-host egress; some publishers 403). */
      backfillOg?: unknown;
      /** List missing targets for an external OG worker (GHA runner). */
      listMissing?: unknown;
      /**
       * Attach a direct image URL resolved off-host (og:image CDN).
       * Body: { attachImageUrl: true, newsItemId: number, imageUrl: string, title?: string }
       */
      attachImageUrl?: unknown;
      newsItemId?: unknown;
      imageUrl?: unknown;
      title?: unknown;
    };

    if (body.clearCache === true) {
      const cleared = await clearPixabayApiCache();
      return NextResponse.json({ ok: true, cleared });
    }

    if (body.clearCardImages === true) {
      const clearedCardImages = await clearAllNewsCardImages();
      const clearedCache = await clearPixabayApiCache();
      return NextResponse.json({ ok: true, clearedCardImages, clearedCache });
    }

    const limit = typeof body.limit === "number" ? body.limit : 10;

    if (body.listMissing === true) {
      const items = await listMissingCardImageTargets(limit);
      return NextResponse.json({ ok: true, mode: "list-missing", items });
    }

    if (body.attachImageUrl === true) {
      const newsItemId = typeof body.newsItemId === "number" ? body.newsItemId : Number(body.newsItemId);
      const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
      const title = typeof body.title === "string" ? body.title : null;
      const result = await attachCardImageFromUrl(newsItemId, imageUrl, title);
            return NextResponse.json(
              { ok: result.ok, mode: "attach-image-url", localPath: result.localPath, reason: result.reason },
              { status: result.ok ? 200 : 422 },
            );
          }

    if (body.backfillOg === true) {
      const summary = await backfillMissingImagesFromOpenGraph(limit);
      return NextResponse.json({ ok: true, mode: "og", summary });
    }

    const summary = await assignMissingNewsCardImages(limit);
    return NextResponse.json({ ok: true, mode: "pixabay", summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown card image assignment error",
      },
      { status: 500 },
    );
  }
}
