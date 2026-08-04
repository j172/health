import { getBaseUrl } from "@/lib/server/news/seo";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";

export type SocialPlatform = "facebook" | "instagram" | "threads";

export const SOCIAL_PLATFORMS: SocialPlatform[] = ["facebook", "instagram", "threads"];

// Facebook has no practical caption length limit worth enforcing; Instagram
// and Threads both reject/truncate posts past their documented caption caps.
const PLATFORM_CAPTION_LIMITS: Record<SocialPlatform, number | null> = {
  facebook: null,
  instagram: 2200,
  threads: 500,
};

export interface CaptionSourceNews {
  id: number;
  title: string;
  description_text: string | null;
  meta_description: string | null;
  dept_name: string | null;
  source_name: string;
  feed_name: string;
}

const sanitizeHashtagSegment = (value: string): string => value.replace(/[\s#().、，,·／/]+/g, "");

// 2-3 hashtags derived from the topic/department per spec section 2.4. Always
// leads with a generic health-news tag, then the government department (or
// feed's agency name when no department is set), and — when the resolved
// source label differs from the department tag — a third tag for the source.
const buildHashtags = (news: CaptionSourceNews, source: string): string[] => {
  const tags = ["#健康新聞"];

  const deptSegment = sanitizeHashtagSegment(news.dept_name || source);
  if (deptSegment) tags.push(`#${deptSegment}`);

  const sourceSegment = sanitizeHashtagSegment(source);
  if (sourceSegment && `#${sourceSegment}` !== tags[tags.length - 1]) {
    tags.push(`#${sourceSegment}`);
  }

  return tags.slice(0, 3);
};

const joinCaptionParts = (parts: string[]): string => parts.filter((part) => part.length > 0).join("\n\n");

/**
 * Renders a platform-specific caption and truncates it to the platform's
 * limit, trimming only the summary — never the link or hashtags — per spec
 * section 2.4. The summary's available budget is derived from the length of
 * everything else (title/source line/link/hashtags) plus the one extra
 * "\n\n" separator that reappears once a non-empty summary is spliced back
 * between the title and the source line.
 */
export const buildSocialCaption = (news: CaptionSourceNews, platform: SocialPlatform): string => {
  const summary = (news.description_text || news.meta_description || "").replace(/\s+/g, " ").trim();
  const source = resolveAuthorLabel({ dept_name: news.dept_name, source_name: news.source_name, feed_name: news.feed_name });
  const url = `${getBaseUrl()}/news/${news.id}`;
  const sourceLine = `資料來源：${source}`;
  const hashtags = buildHashtags(news, source).join(" ");

  const render = (renderedSummary: string): string => joinCaptionParts([news.title, renderedSummary, sourceLine, url, hashtags]);

  const full = render(summary);
  const limit = PLATFORM_CAPTION_LIMITS[platform];
  if (limit === null || full.length <= limit) return full;

  const withoutSummary = render("");
  if (withoutSummary.length >= limit) {
    // Even title + source + link + hashtags alone don't fit (very rare for
    // real RSS titles) — hard-truncate as a last resort rather than throwing.
    return withoutSummary.slice(0, limit);
  }

  // The extra "2" accounts for the additional "\n\n" separator introduced
  // once a non-empty summary is spliced between the title and the source line.
  const summaryBudget = limit - withoutSummary.length - 2;
  if (summaryBudget <= 0) return withoutSummary;

  const truncatedSummary = summaryBudget > 1 ? `${summary.slice(0, summaryBudget - 1)}…` : summary.slice(0, summaryBudget);
  return render(truncatedSummary);
};
