import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { runCloudflareAiChat } from "@/lib/server/cloudflare/aiClient";

const SITE_NAME = "j172tw Health";

const truncate = (text: string, max: number): string => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trim()}…`;
};

export interface SeoMetadataInput {
  title: string;
  descriptionText: string;
  detailText: string | null;
  feedName: string;
  deptName: string | null;
  sourceName: string;
  publishedAtUtc: Date | null;
}

export interface GeneratedSeoMetadata {
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  geoSummary: string;
}

/**
 * Computes SEO metadata (meta title/description, keywords) and a GEO
 * (Generative Engine Optimization) summary once at ingestion time, so it's
 * stored alongside the article instead of recomputed from scratch on every
 * page render. The GEO summary is a short, self-contained factual statement
 * (who/what/when) written so an AI search engine or LLM can quote it
 * directly as a citable answer, distinct from the meta description's job of
 * enticing a human click in search results.
 */
export const generateSeoMetadataFallback = (item: SeoMetadataInput): GeneratedSeoMetadata => {
  const bodyText = (item.detailText || item.descriptionText || "").trim();
  const authorLabel = resolveAuthorLabel({ dept_name: item.deptName, source_name: item.sourceName, feed_name: item.feedName });

  const metaTitle = truncate(`${item.title} | ${SITE_NAME}`, 255);
  const metaDescription = truncate(bodyText || item.title, 155);

  const keywords = Array.from(new Set([item.feedName, item.deptName, authorLabel, "健康新聞"].filter((value): value is string => Boolean(value)))).join(
    ",",
  );

  const publishedDate = item.publishedAtUtc
    ? new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(item.publishedAtUtc)
    : null;
  const firstSentence = bodyText.split(/(?<=[。！？.!?])/)[0]?.trim();
  const geoSummary = truncate(
    `${item.title}。${publishedDate ? `${publishedDate}，` : ""}${authorLabel}報導：${firstSentence || item.title}`,
    600,
  );

  return { metaTitle, metaDescription, keywords, geoSummary };
};

const AI_TIMEOUT_MS = 20_000;
const MAX_SOURCE_CHARS = 2000;

const extractJson = (text: string): unknown => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in AI response.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
};

/**
 * AI-generated version of generateSeoMetadataFallback, using Cloudflare
 * Workers AI to write a real meta description, keyword list, and GEO
 * (Generative Engine Optimization) summary instead of template-stitching
 * them from the raw text. Falls back to the deterministic version on any
 * failure (not configured, network error, malformed response) — ingestion
 * must never block on a third-party AI call.
 */
export const generateSeoMetadataWithAi = async (item: SeoMetadataInput): Promise<GeneratedSeoMetadata> => {
  const fallback = generateSeoMetadataFallback(item);

  try {
    const bodyText = (item.detailText || item.descriptionText || "").trim().slice(0, MAX_SOURCE_CHARS);
    const authorLabel = resolveAuthorLabel({ dept_name: item.deptName, source_name: item.sourceName, feed_name: item.feedName });
    if (!bodyText) return fallback;

    const prompt = [
      "你是新聞網站的 SEO 編輯。根據以下健康新聞內容，產生繁體中文的 SEO 與 GEO（Generative Engine Optimization）中繼資料。",
      "只回傳一個 JSON 物件，不要加任何說明文字或 markdown，格式如下：",
      '{"metaDescription": "...", "keywords": "...", "geoSummary": "..."}',
      "- metaDescription: 給搜尋引擎結果的摘要，繁體中文，120-155字，吸引人點擊。",
      "- keywords: 3-6 個逗號分隔的繁體中文關鍵字。",
      "- geoSummary: 給 AI 搜尋引擎（如 ChatGPT、Perplexity）直接引用的獨立事實摘要，包含誰、發生什麼事、何時，100-200字，語氣客觀陳述。",
      "",
      `標題：${item.title}`,
      `來源：${authorLabel}`,
      `內容：${bodyText}`,
    ].join("\n");

    const raw = await runCloudflareAiChat(prompt, AI_TIMEOUT_MS);
    const parsed = extractJson(raw) as { metaDescription?: unknown; keywords?: unknown; geoSummary?: unknown };

    const metaDescription = typeof parsed.metaDescription === "string" && parsed.metaDescription.trim() ? truncate(parsed.metaDescription, 500) : fallback.metaDescription;
    const keywords = typeof parsed.keywords === "string" && parsed.keywords.trim() ? truncate(parsed.keywords, 500) : fallback.keywords;
    const geoSummary = typeof parsed.geoSummary === "string" && parsed.geoSummary.trim() ? truncate(parsed.geoSummary, 2000) : fallback.geoSummary;

    return { metaTitle: fallback.metaTitle, metaDescription, keywords, geoSummary };
  } catch {
    return fallback;
  }
};
