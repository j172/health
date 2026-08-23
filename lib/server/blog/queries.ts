import { type NewsListItem } from "@/lib/server/news/queries";
import { httpGetText } from "@/lib/server/net/httpClient";

function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#038;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8217;/g, "’")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8230;/g, "…");
}

function extractFeaturedImage(html: string): string | null {
  if (!html) return null;

  // 1. Check og:image or twitter:image
  const ogMatch =
    html.match(/<meta\s+(?:property|name)=["'](?:og:image|twitter:image)["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  if (ogMatch && ogMatch[1]) {
    return ogMatch[1].replace(/&amp;/g, "&");
  }

  // 2. Check WordPress wp-post-image (Featured Image)
  const wpPostImgMatch = html.match(/<img[^>]+class=["'][^"']*wp-post-image[^"']*["'][^>]*>/i);
  if (wpPostImgMatch) {
    const tag = wpPostImgMatch[0];
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      return srcMatch[1].replace(/&amp;/g, "&");
    }
  }

  // 3. Check first content image
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  const searchArea = articleMatch ? articleMatch[0] : html;
  const allImgs = searchArea.match(/<img[^>]+>/gi) || [];
  for (const img of allImgs) {
    if (/custom-logo|avatar|gravatar/i.test(img)) continue;
    const srcMatch = img.match(/src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1] && !srcMatch[1].startsWith("data:")) {
      return srcMatch[1].replace(/&amp;/g, "&");
    }
  }

  return null;
}

const FEED_URL = "https://blog.j172.tw/feed/";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour in-memory cache

let cachedBlogItem: { item: NewsListItem; expiresAt: number } | null = null;

/**
 * Fetches the latest post from https://blog.j172.tw/feed/ and maps it to a NewsListItem.
 * Uses native httpGetText to safely execute within Linux shared-hosting ulimit memory constraints.
 * Returns null if the feed is unavailable or parsing fails, enabling seamless fallback.
 */
export async function getLatestBlogPost(): Promise<NewsListItem | null> {
  const now = Date.now();
  if (cachedBlogItem && now < cachedBlogItem.expiresAt) {
    return cachedBlogItem.item;
  }

  try {
    const { status, text: xml } = await httpGetText(FEED_URL, {
      timeoutMs: 8000,
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (status < 200 || status >= 300 || !xml) {
      console.warn(`[getLatestBlogPost] Feed responded with status ${status}`);
      return cachedBlogItem ? cachedBlogItem.item : null;
    }

    const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
    if (!itemMatch) return cachedBlogItem ? cachedBlogItem.item : null;

    const itemXml = itemMatch[1];
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);
    const pubDateMatch = itemXml.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/);
    const creatorMatch = itemXml.match(/<dc:creator>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/dc:creator>/);
    const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);

    const title = decodeHtmlEntities(titleMatch ? titleMatch[1].trim() : "");
    const link = linkMatch ? linkMatch[1].trim() : "";
    const pubDateRaw = pubDateMatch ? pubDateMatch[1].trim() : "";
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : new Date();
    const creator = creatorMatch ? creatorMatch[1].trim() : "Jay Fan-Chiang";
    const description = decodeHtmlEntities(descMatch ? descMatch[1].trim() : "");

    if (!title || !link) return cachedBlogItem ? cachedBlogItem.item : null;

    // Fetch featured image from the post page
    let cardImageUrl: string | null = null;
    try {
      const pageRes = await httpGetText(link, { timeoutMs: 5000 });
      if (pageRes.status >= 200 && pageRes.status < 300 && pageRes.text) {
        cardImageUrl = extractFeaturedImage(pageRes.text);
      }
    } catch {
      // Ignore image fetch errors; CardThumb will render graceful brand gradient
    }

    const item: NewsListItem = {
      id: -1,
      source_name: "blog_j172",
      feed_code: "blog_j172",
      feed_name: "j172tw Blogz",
      dept_name: creator || "Jay Fan-Chiang",
      title,
      canonical_url: link,
      published_at_utc: isNaN(pubDate.getTime()) ? new Date() : pubDate,
      description_html: description,
      card_image_url: cardImageUrl,
      card_image_source: "og_image",
      card_image_source_page_url: link,
      card_image_contributor: creator || "Jay Fan-Chiang",
      location_name: null,
    };

    cachedBlogItem = { item, expiresAt: now + CACHE_TTL_MS };
    return item;
  } catch (err) {
    console.error("[getLatestBlogPost] Failed to fetch or parse blog RSS:", err);
    return cachedBlogItem ? cachedBlogItem.item : null;
  }
}
