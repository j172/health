import { load } from "cheerio";
import type { Metadata } from "next";
import type { NewsListItem, NewsDetailItem } from "./queries";
import { resolveAuthorLabel, hasSourceLabel } from "./sourceLabels";
import type { ToolCatalogEntry } from "@/lib/server/tools/catalog";

/**
 * og:image resolution for an article. Falls back to a source-branded
 * placeholder when card_image_url is null, using a **static PNG generated
 * at deploy time** (scripts/generate-source-og-images.mjs, run as a
 * deploy-ftps.yml step on the GitHub Actions runner) rather than rendered
 * on demand.
 */
const resolveArticleImageUrl = (news: NewsDetailItem, baseUrl: string): string =>
  toAbsoluteUrl(news.card_image_url, baseUrl) ??
  `${baseUrl}/images/og/source/${hasSourceLabel(news.source_name) ? encodeURIComponent(news.source_name) : "_default"}.png`;

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
  const imageUrl = resolveArticleImageUrl(news, baseUrl);
  const publishedTime = news.published_at_utc ? new Date(news.published_at_utc).toISOString() : undefined;
  const keywords = news.keywords?.trim()
    ? news.keywords.split(",").map((value) => value.trim()).filter(Boolean)
    : [news.feed_name, news.dept_name ?? undefined, "健康新聞", "衛生福利部", "疾病管制署", "國民健康署"].filter((value): value is string => Boolean(value));

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
      alternateLocale: ["zh_CN", "en_US"],
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
  const imageUrl = resolveArticleImageUrl(news, baseUrl);
  const publishedTime = news.published_at_utc ? new Date(news.published_at_utc).toISOString() : undefined;
  const authorName = resolveAuthorLabel(news);

  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: news.title,
    description,
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

/** Site-wide Organization schema — establishes publisher identity and E-E-A-T trust signals */
export const buildOrganizationJsonLd = (): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: baseUrl,
    logo: `${baseUrl}/images/favicon.ico`,
    description: SITE_DESCRIPTION,
    inLanguage: "zh-TW",
    knowsAbout: ["公共衛生", "醫療院所", "長期照顧", "空氣品質", "食品安全", "健康新聞", "傳染病防治", "健康計算評估"],
    publishingPrinciples: `${baseUrl}/privacy`,
    sameAs: [baseUrl],
  };
};

/** Site-wide WebSite schema with a SearchAction */
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

/** Generic BreadcrumbList schema */
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

/** ItemList schema for tool catalog or news listing page */
export const buildItemListJsonLd = (listName: string, items: { name: string; url: string; description?: string }[]): Record<string, unknown> => {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url,
      description: item.description,
    })),
  };
};

/** News listing ItemList schema */
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

/**
 * Composite JSON-LD for /tools/<slug> pages.
 * Combines BreadcrumbList + MedicalWebPage/WebPage + WebApplication + FAQPage + Citations.
 */
export const buildToolPageJsonLd = (tool: ToolCatalogEntry): Record<string, unknown>[] => {
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}/tools/${tool.slug}`;

  const breadcrumbs = buildBreadcrumbJsonLd([
    { name: "首頁", url: baseUrl },
    { name: "健康工具", url: `${baseUrl}/tools` },
    { name: tool.title, url: canonical },
  ]);

  const citations = tool.scientificBasis.map((ref) => ({
    "@type": "CreativeWork",
    name: ref.title,
    author: { "@type": "Organization", name: ref.authority },
    url: ref.url ?? undefined,
  }));

  const webApp: Record<string, unknown> = {
    "@type": "WebApplication",
    name: tool.title,
    url: canonical,
    description: tool.description,
    inLanguage: "zh-TW",
    applicationCategory: "HealthApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "TWD" },
  };

  const medicalPage: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    name: tool.title,
    url: canonical,
    description: tool.description,
    abstract: tool.directAnswer,
    inLanguage: ["zh-TW", "zh-Hant"],
    medicalAudience: { "@type": "MedicalAudience", audienceType: "Patient" },
    citation: citations,
    mainEntity: webApp,
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", "#aeo-direct-answer", "#tool-faq-heading"],
    },
  };

  const schemas: Record<string, unknown>[] = [breadcrumbs, medicalPage];

  if (tool.faqs.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: tool.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }

  return schemas;
};
