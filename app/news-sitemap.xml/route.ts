import { listRecentNewsForNewsSitemap } from "@/lib/server/news/queries";
import { getBaseUrl, resolveArticleImageUrl, SITE_NAME } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escapeXml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/**
 * Google News Sitemap (https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap)
 * — a separate, narrower sitemap from sitemap.xml: Google only accepts
 * articles published in the last 48 hours here, each with a <news:title>,
 * so it's rebuilt from scratch on every request rather than reusing the
 * general sitemap's (much larger, historical) URL list.
 * Includes Google Image Sitemap extensions for high-res news images.
 */
export async function GET(): Promise<Response> {
  const baseUrl = getBaseUrl();
  const items = await listRecentNewsForNewsSitemap(48);

  const urls = items
    .map((item) => {
      const publicationDate = item.published_at_utc ? new Date(item.published_at_utc).toISOString() : null;
      if (!publicationDate) return "";
      const imageUrl = resolveArticleImageUrl(item, baseUrl);
      const imageTag = imageUrl
        ? `\n    <image:image>
      <image:loc>${escapeXml(imageUrl)}</image:loc>
      <image:title>${escapeXml(item.title)}</image:title>
    </image:image>`
        : "";

      return `  <url>
    <loc>${escapeXml(`${baseUrl}/news/${item.id}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(SITE_NAME)}</news:name>
        <news:language>zh-tw</news:language>
      </news:publication>
      <news:publication_date>${publicationDate}</news:publication_date>
      <news:title>${escapeXml(item.title)}</news:title>
    </news:news>${imageTag}
  </url>`;
    })
    .filter(Boolean)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=900",
    },
  });
}
