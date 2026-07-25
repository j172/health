import { load } from "cheerio";
import type { Metadata } from "next";
import type { NewsDetailItem } from "./queries";
import { resolveAuthorLabel } from "./sourceLabels";

const SITE_NAME = "j172tw Health";

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

  return {
    title: `${news.title} | ${SITE_NAME}`,
    description,
    keywords: [news.feed_name, news.dept_name ?? undefined, "健康新聞", "衛生福利部"].filter(
      (value): value is string => Boolean(value),
    ),
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
    speakable: { "@type": "SpeakableSpecification", cssSelector: ["h1", "article"] },
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
