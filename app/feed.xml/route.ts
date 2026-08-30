import { listRecentNewsForLlms } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { getBaseUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/server/news/seo";
import { displayDate } from "@/lib/format/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * RSS 2.0 Feed (https://www.rssboard.org/rss-specification)
 * Real-time syndication feed for Google News, AI monitoring agents, feed readers,
 * and external news aggregators. Inlines AI GEO summaries for each article.
 */
export async function GET(): Promise<Response> {
  const baseUrl = getBaseUrl();
  const items = await listRecentNewsForLlms(50);

  const itemsXml = items
    .map((item) => {
      // COALESCE(published_at_utc, first_seen_at_utc), same as the list order
      // and the cards (issue #92). The old `?? new Date()` restamped every
      // undated item with the current time on every request, so a reader's
      // feed client saw the same articles arrive again and again.
      const pubDate = new Date(displayDate(item) ?? Date.now()).toUTCString();
      const authorLabel = resolveAuthorLabel({ dept_name: item.dept_name, source_name: item.source_name, feed_name: item.feed_name });
      const summary = item.geo_summary?.trim() || item.meta_description?.trim() || item.title;
      const articleUrl = `${baseUrl}/news/${item.id}`;

      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(articleUrl)}</link>
      <guid isPermaLink="true">${escapeXml(articleUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
      <author>${escapeXml(authorLabel)}</author>
      <category>${escapeXml(item.feed_name)}</category>
      <description><![CDATA[${summary}]]></description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)} - 最新公衛與健康新聞</title>
    <link>${escapeXml(`${baseUrl}/news`)}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>zh-tw</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(`${baseUrl}/feed.xml`)}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=900",
    },
  });
}
