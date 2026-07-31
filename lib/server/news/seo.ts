import { load } from "cheerio";
import type { Metadata } from "next";
import type { NewsListItem, NewsDetailItem } from "./queries";
import { resolveAuthorLabel } from "./sourceLabels";

export const SITE_NAME = "j172tw Healthz";
export const SITE_DESCRIPTION = "彙整台灣官方機構健康新聞、ESG永續發展與企業社會責任報導，以及中央氣象署即時警報，提供繁體中文公共資訊總覽。";

export const getBaseUrl = (): string => (process.env.APP_BASE_URL?.trim() || "https://health.j172.tw").replace(/\/$/, "");

const stripHtml = (html: string | null): string => {
  if (!html) return "";
  const $ = load(html, null, false);
  return $.root().text().replace(/\s+/g, " ").trim();
};

const toAbsoluteUrl = (url: string | null, baseUrl: string): string | undefined => {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
};

export const buildArticleDescription = (news: NewsDetailItem, maxLength = 155): string => {
  if (news.meta_description?.trim()) return news.meta_description.trim();
  const source = news.detail_text?.trim() || stripHtml(news.description_html) || news.title;
  const normalized = source.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
};

export const buildArticleMetadata = (news: NewsDetailItem): Metadata => {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/news/${news.id}`;
  const description = buildArticleDescription(news);
  const imageUrl = toAbsoluteUrl(news.card_image_url, baseUrl);
  const publishedTime = news.published_at_utc ? new Date(news.published_at_utc).toISOString() : undefined;
  const keywords = news.keywords?.trim()
    ? news.keywords.split(",").map((value) => value.trim()).filter(Boolean)
    : [news.feed_name, news.dept_name ?? undefined, "健康新聞", "衛生福利部"].filter((value): value is string => Boolean(value));

  return {
    title: news.meta_title?.trim() || `${news.title} | ${SITE_NAME}`,
    description,
    keywords,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      title: news.title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "zh_TW",
      publishedTime,
      modifiedTime: publishedTime,
      authors: news.dept_name ? [news.dept_name] : undefined,
      images: imageUrl ? [{ url: imageUrl, alt: news.title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: news.title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
};

export const buildArticleJsonLd = (news: NewsDetailItem): Record<string, unknown>[] => {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/news/${news.id}`;
  const description = buildArticleDescription(news);
  const imageUrl = toAbsoluteUrl(news.card_image_url, baseUrl);
  const publishedTime = news.published_at_utc ? new Date(news.published_at_utc).toISOString() : undefined;
  const authorName = resolveAuthorLabel(news);

  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: news.title,
    description,
    // A self-contained, citable factual summary for AI search engines/LLMs
    // (Generative Engine Optimization) — generated once at ingestion time,
    // distinct from `description`'s job of enticing a human click.
    abstract: news.geo_summary?.trim() || description,
    datePublished: publishedTime,
    dateModified: publishedTime,
    inLanguage: "zh-TW",
    isAccessibleForFree: true,
    articleSection: news.feed_name,
    url,
    author: { "@type": "Organization", name: authorName },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${baseUrl}/images/favicon.ico` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    // "#geo-summary" is the visible TL;DR box rendered on the article page
    // (app/news/[id]/page.tsx) when geo_summary is present — falls back to
    // the whole article for the (currently rare) item that has none.
    speakable: { "@type": "SpeakableSpecification", cssSelector: news.geo_summary?.trim() ? ["h1", "#geo-summary"] : ["h1", "article"] },
  };
  if (imageUrl) {
    article.image = [imageUrl];
  }

  const breadcrumbs: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首頁", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "健康新聞", item: `${baseUrl}/news` },
      { "@type": "ListItem", position: 3, name: news.title, item: url },
    ],
  };

  return [article, breadcrumbs];
};

/** Site-wide Organization schema — establishes publisher identity for both
 * classic SEO (Google's publisher/knowledge-panel signals) and GEO (lets an
 * AI search engine attribute a citation to a named, described entity rather
 * than a bare domain). Emit once per HTML document (root layout). */
export const buildOrganizationJsonLd = (): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: baseUrl,
    logo: `${baseUrl}/images/favicon.ico`,
    description: SITE_DESCRIPTION,
    knowsAbout: ["公共衛生", "醫療院所", "長期照顧", "空氣品質", "食品安全", "健康新聞", "傳染病防治"],
    sameAs: [baseUrl],
  };
};

/** Site-wide WebSite schema with a SearchAction, so search engines can offer
 * a sitelinks searchbox — emit alongside Organization in the root layout. */
export const buildWebsiteJsonLd = (): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: baseUrl,
    description: SITE_DESCRIPTION,
    inLanguage: "zh-TW",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${baseUrl}/news?keyword={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
};

/** Generic BreadcrumbList schema for non-article pages (e.g. /tools/*). */
export const buildBreadcrumbJsonLd = (items: { name: string; url: string }[]): Record<string, unknown> => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: item.url,
  })),
});

/** ItemList schema for a news listing page (home or /news archive), so
 * crawlers and AI agents can enumerate the current batch of articles as
 * structured data rather than only inferring it from card markup. */
export const buildNewsListJsonLd = (items: NewsListItem[], listName: string): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${baseUrl}/news/${item.id}`,
      name: item.title,
    })),
  };
};
