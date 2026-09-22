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
export const resolveArticleImageUrl = (
  news: { card_image_url?: string | null; source_name?: string | null },
  baseUrl: string,
): string =>
  toAbsoluteUrl(news.card_image_url ?? null, baseUrl) ??
  `${baseUrl}/images/og/source/${news.source_name && hasSourceLabel(news.source_name) ? encodeURIComponent(news.source_name) : "_default"}.png`;

export const SITE_NAME = "j172tw Healthz";
export const SITE_DESCRIPTION =
  "彙整台灣官方機構公衛醫療新聞、ESG永續發展報導與中央氣象署即時警報，並提供健康計算、醫療照護、交通能源、防災示警等便民生活工具，打造繁體中文公共資訊與便民服務總覽。";

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
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "article",
      title: news.title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "zh_TW",
      alternateLocale: ["en_US"],
      publishedTime,
      modifiedTime: publishedTime,
      authors: news.dept_name ? [news.dept_name] : undefined,
      images: imageUrl ? [{ url: imageUrl, alt: news.title, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: news.title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
};

const GOV_SOURCES = new Set([
  "mohw",
  "hpa",
  "cdc",
  "tfda",
  "nhi",
  "moenv",
  "water_gov",
  "cwa",
  "sfaa",
  "ncl",
]);

const HOSPITAL_SOURCES = new Set(["femh", "cgmh", "vghtpe"]);

/**
 * Resolves the accurate Schema.org Organization type for E-E-A-T trust signals.
 * Government health agencies are marked GovernmentOrganization, hospitals as MedicalOrganization.
 */
export const resolveAuthorType = (
  sourceName?: string | null,
): "GovernmentOrganization" | "MedicalOrganization" | "NewsMediaOrganization" => {
  if (!sourceName) return "NewsMediaOrganization";
  if (GOV_SOURCES.has(sourceName)) return "GovernmentOrganization";
  if (HOSPITAL_SOURCES.has(sourceName)) return "MedicalOrganization";
  return "NewsMediaOrganization";
};

/** Shared Organization entity for @graph */
export const buildOrganizationEntity = (baseUrl: string): Record<string, unknown> => ({
  "@type": "Organization",
  "@id": `${baseUrl}/#organization`,
  name: SITE_NAME,
  url: baseUrl,
  logo: {
    "@type": "ImageObject",
    "@id": `${baseUrl}/#logo`,
    url: `${baseUrl}/images/icon/pwa-512.png`,
    caption: SITE_NAME,
    width: 512,
    height: 512,
  },
  description: SITE_DESCRIPTION,
  inLanguage: "zh-TW",
  knowsAbout: ["公共衛生", "醫療院所", "長期照顧", "空氣品質", "食品安全", "健康新聞", "傳染病防治", "健康計算評估"],
  publishingPrinciples: `${baseUrl}/privacy`,
  ethicsPolicy: `${baseUrl}/privacy`,
  correctionsPolicy: `${baseUrl}/privacy`,
  sameAs: [baseUrl],
});

/** Shared WebSite entity with SearchAction for @graph */
export const buildWebSiteEntity = (baseUrl: string): Record<string, unknown> => ({
  "@type": "WebSite",
  "@id": `${baseUrl}/#website`,
  url: baseUrl,
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  publisher: { "@id": `${baseUrl}/#organization` },
  inLanguage: "zh-TW",
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${baseUrl}/news?keyword={search_term_string}` },
    "query-input": "required name=search_term_string",
  },
});

/** SiteNavigationElements for Google Sitelinks */
export const buildSiteNavigationElements = (baseUrl: string): Record<string, unknown>[] => [
  {
    "@type": "SiteNavigationElement",
    "@id": `${baseUrl}/#nav-home`,
    name: "首頁",
    url: baseUrl,
  },
  {
    "@type": "SiteNavigationElement",
    "@id": `${baseUrl}/#nav-news`,
    name: "公衛健康新聞",
    url: `${baseUrl}/news`,
  },
  {
    "@type": "SiteNavigationElement",
    "@id": `${baseUrl}/#nav-tools`,
    name: "健康工具與公衛資料庫",
    url: `${baseUrl}/tools`,
  },
  {
    "@type": "SiteNavigationElement",
    "@id": `${baseUrl}/#nav-privacy`,
    name: "隱私權政策與免責聲明",
    url: `${baseUrl}/privacy`,
  },
  {
    "@type": "SiteNavigationElement",
    "@id": `${baseUrl}/#nav-llm-info`,
    name: "Hey AI, learn about j172.tw Healthz",
    url: `${baseUrl}/llm-info`,
  },
];

/**
 * Composite Schema.org @graph for /llm-info page.
 */
export const buildLlmInfoGraphJsonLd = (): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}/llm-info`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationEntity(baseUrl),
      buildWebSiteEntity(baseUrl),
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首頁", item: baseUrl },
          { "@type": "ListItem", position: 2, name: "Hey AI, learn about j172.tw Healthz", item: canonical },
        ],
      },
      {
        "@type": "AboutPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: `Hey AI, learn about ${SITE_NAME} | Official LLM Profile`,
        description: `Official structured information and usage directives about ${SITE_NAME} for AI assistants (ChatGPT, Claude, Gemini, Perplexity) and large language models.`,
        isPartOf: { "@id": `${baseUrl}/#website` },
        breadcrumb: { "@id": `${canonical}#breadcrumb` },
        inLanguage: ["zh-TW", "en"],
        about: { "@id": `${baseUrl}/#organization` },
      },
    ],
  };
};

/**
 * Site-wide Schema.org @graph generator for pages without specific entity schemas.
 */
export const buildSiteGraphJsonLd = (): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationEntity(baseUrl),
      buildWebSiteEntity(baseUrl),
      ...buildSiteNavigationElements(baseUrl),
    ],
  };
};

/**
 * High-authority Schema.org @graph for News Article pages.
 * Links Organization -> WebSite -> BreadcrumbList -> WebPage -> NewsArticle with E-E-A-T entity reconciliation.
 */
export const buildArticleGraphJsonLd = (news: NewsDetailItem): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/news/${news.id}`;
  const description = buildArticleDescription(news);
  const imageUrl = resolveArticleImageUrl(news, baseUrl);
  const publishedTime = news.published_at_utc ? new Date(news.published_at_utc).toISOString() : undefined;
  const authorName = resolveAuthorLabel(news);
  const authorType = resolveAuthorType(news.source_name);

  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationEntity(baseUrl),
      buildWebSiteEntity(baseUrl),
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首頁", item: baseUrl },
          { "@type": "ListItem", position: 2, name: "健康新聞", item: `${baseUrl}/news` },
          { "@type": "ListItem", position: 3, name: news.title, item: url },
        ],
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: news.title,
        description,
        isPartOf: { "@id": `${baseUrl}/#website` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        mainEntity: { "@id": `${url}#article` },
        inLanguage: "zh-TW",
      },
      {
        "@type": "NewsArticle",
        "@id": `${url}#article`,
        isPartOf: { "@id": `${url}#webpage` },
        headline: news.title,
        description,
        abstract: news.geo_summary?.trim() || description,
        datePublished: publishedTime,
        dateModified: publishedTime,
        inLanguage: "zh-TW",
        isAccessibleForFree: true,
        articleSection: news.feed_name,
        url,
        mainEntityOfPage: { "@id": `${url}#webpage` },
        publisher: { "@id": `${baseUrl}/#organization` },
        author: {
          "@type": authorType,
          name: authorName,
          ...(news.canonical_url ? { url: news.canonical_url } : {}),
        },
        image: imageUrl ? [imageUrl] : undefined,
        ...(news.canonical_url ? { isBasedOn: news.canonical_url } : {}),
        speakable: {
          "@type": "SpeakableSpecification",
          cssSelector: news.geo_summary?.trim() ? ["h1", "#geo-summary"] : ["h1", "article"],
        },
      },
    ],
  };
};

/**
 * Composite Schema.org @graph for /tools/<slug> pages.
 * Combines Organization + WebSite + BreadcrumbList + MedicalWebPage/WebPage + WebApplication + FAQPage + Citations.
 */
export const buildToolGraphJsonLd = (tool: ToolCatalogEntry): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}/tools/${tool.slug}`;
  const pageType = tool.schemaType ?? "MedicalWebPage";

  const citations = tool.scientificBasis.map((ref) => ({
    "@type": "CreativeWork",
    name: ref.title,
    author: { "@type": "Organization", name: ref.authority },
    url: ref.url ?? undefined,
  }));

  const graph: Record<string, unknown>[] = [
    buildOrganizationEntity(baseUrl),
    buildWebSiteEntity(baseUrl),
    {
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: baseUrl },
        { "@type": "ListItem", position: 2, name: "健康工具", item: `${baseUrl}/tools` },
        { "@type": "ListItem", position: 3, name: tool.title, item: canonical },
      ],
    },
    {
      "@type": pageType,
      "@id": `${canonical}#webpage`,
      name: tool.title,
      url: canonical,
      description: tool.description,
      abstract: tool.directAnswer,
      inLanguage: ["zh-TW", "zh-Hant"],
      isPartOf: { "@id": `${baseUrl}/#website` },
      breadcrumb: { "@id": `${canonical}#breadcrumb` },
      mainEntity: { "@id": `${canonical}#app` },
      citation: citations,
      ...(pageType === "MedicalWebPage"
        ? { medicalAudience: { "@type": "MedicalAudience", audienceType: "Patient" } }
        : {}),
      speakable: {
        "@type": "SpeakableSpecification",
        cssSelector: ["h1", "#aeo-direct-answer", "#tool-faq-heading"],
      },
    },
    {
      "@type": "WebApplication",
      "@id": `${canonical}#app`,
      name: tool.title,
      url: canonical,
      description: tool.description,
      inLanguage: "zh-TW",
      applicationCategory: "HealthApplication",
      operatingSystem: "Any",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "TWD" },
    },
  ];

  if (tool.faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${canonical}#faq`,
      isPartOf: { "@id": `${canonical}#webpage` },
      mainEntity: tool.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
};

/**
 * Composite Schema.org @graph for Home page.
 */
export const buildHomeGraphJsonLd = (items: NewsListItem[]): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationEntity(baseUrl),
      buildWebSiteEntity(baseUrl),
      ...buildSiteNavigationElements(baseUrl),
      {
        "@type": "WebPage",
        "@id": `${baseUrl}/#webpage`,
        url: baseUrl,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        isPartOf: { "@id": `${baseUrl}/#website` },
        inLanguage: "zh-TW",
      },
      {
        "@type": "ItemList",
        "@id": `${baseUrl}/#latest-news`,
        name: "最新公衛與健康新聞",
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${baseUrl}/news/${item.id}`,
          name: item.title,
        })),
      },
    ],
  };
};

/**
 * Composite Schema.org @graph for Tools Index page (/tools).
 */
export const buildToolsIndexGraphJsonLd = (tools: ToolCatalogEntry[]): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationEntity(baseUrl),
      buildWebSiteEntity(baseUrl),
      {
        "@type": "BreadcrumbList",
        "@id": `${baseUrl}/tools#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首頁", item: baseUrl },
          { "@type": "ListItem", position: 2, name: "健康工具與公衛資料庫", item: `${baseUrl}/tools` },
        ],
      },
      {
        "@type": "WebPage",
        "@id": `${baseUrl}/tools#webpage`,
        url: `${baseUrl}/tools`,
        name: "健康工具與公衛資料庫總覽",
        description:
          "免費線上健康計算器、疾病心血管評估、即時紫外線與地震監測，以及全台醫療院所與長照機構開放資料庫總覽。",
        isPartOf: { "@id": `${baseUrl}/#website` },
        breadcrumb: { "@id": `${baseUrl}/tools#breadcrumb` },
        inLanguage: "zh-TW",
      },
      {
        "@type": "ItemList",
        "@id": `${baseUrl}/tools#catalog`,
        name: "健康工具與公衛資料庫目錄",
        mainEntityOfPage: { "@id": `${baseUrl}/tools#webpage` },
        itemListElement: tools.map((tool, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${baseUrl}/tools/${tool.slug}`,
          name: tool.title,
          description: tool.description,
        })),
      },
    ],
  };
};

/**
 * Backward compatibility wrappers
 */
export const buildArticleJsonLd = (news: NewsDetailItem): Record<string, unknown>[] => [
  buildArticleGraphJsonLd(news),
];

export const buildToolPageJsonLd = (tool: ToolCatalogEntry): Record<string, unknown>[] => [
  buildToolGraphJsonLd(tool),
];

export const buildOrganizationJsonLd = (): Record<string, unknown> => {
  return buildOrganizationEntity(getBaseUrl());
};

export const buildWebsiteJsonLd = (): Record<string, unknown> => {
  return buildWebSiteEntity(getBaseUrl());
};

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

export const buildItemListJsonLd = (listName: string, items: { name: string; url: string; description?: string }[]): Record<string, unknown> => ({
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
});

export const buildNewsListJsonLd = (items: NewsListItem[], listName: string): Record<string, unknown> => {
  const baseUrl = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationEntity(baseUrl),
      buildWebSiteEntity(baseUrl),
      {
        "@type": "BreadcrumbList",
        "@id": `${baseUrl}/news#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首頁", item: baseUrl },
          { "@type": "ListItem", position: 2, name: "健康新聞", item: `${baseUrl}/news` },
        ],
      },
      {
        "@type": "WebPage",
        "@id": `${baseUrl}/news#webpage`,
        url: `${baseUrl}/news`,
        name: listName,
        description: SITE_DESCRIPTION,
        isPartOf: { "@id": `${baseUrl}/#website` },
        breadcrumb: { "@id": `${baseUrl}/news#breadcrumb` },
        inLanguage: "zh-TW",
      },
      {
        "@type": "ItemList",
        "@id": `${baseUrl}/news#list`,
        name: listName,
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${baseUrl}/news/${item.id}`,
          name: item.title,
        })),
      },
    ],
  };
};
