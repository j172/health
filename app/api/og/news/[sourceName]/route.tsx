import { ImageResponse } from "next/og";
import { getSourcePlaceholderStyle, PLACEHOLDER_HEX_COLORS } from "@/lib/server/news/sourcePlaceholder";

export const runtime = "nodejs";

/**
 * Dynamic og:image for articles with no card_image_url — same source-
 * branded, text-only design as CardThumb.tsx's card-thumbnail fallback (see
 * sourcePlaceholder.ts), but rendered as a real PNG since social-preview
 * crawlers (Facebook/Twitter/etc, seo.ts's buildArticleMetadata) need an
 * actual fetchable image URL, not a client-rendered React component.
 * Rendered on demand rather than pre-generated to static files at deploy
 * time — no build step to maintain, and any design change here takes
 * effect immediately without regenerating anything.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ sourceName: string }> }): Promise<Response> {
  const { sourceName } = await params;
  const { label, isGov } = getSourcePlaceholderStyle(decodeURIComponent(sourceName));
  const colors = isGov ? PLACEHOLDER_HEX_COLORS.gov : PLACEHOLDER_HEX_COLORS.media;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(to bottom right, ${colors.bgFrom}, ${colors.bgTo})`,
        }}
      >
        <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: colors.accent, letterSpacing: -1 }}>{label}</div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 24, fontWeight: 500, color: "#94a3b8", letterSpacing: 2 }}>
          j172tw Healthz
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
