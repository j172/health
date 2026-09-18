// Client-safe helpers for the /out outbound-redirect interstitial (issue #137).
// No server-only imports here — these run in both the /out server page and any
// client component that needs to build or validate an outbound link.

export interface OutboundUtmOptions {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

/**
 * Validates a candidate outbound URL for the `/out?url=` interstitial.
 *
 * Only absolute `https://` URLs with a hostname are accepted. Everything else
 * (relative paths, `javascript:`/`data:`/`http:` schemes, malformed input) is
 * rejected — this is the open-redirect guard: `/out` must never be usable to
 * bounce a visitor to an arbitrary attacker-chosen destination via a scheme
 * that a browser could execute or that pretends to be same-site.
 *
 * Returns the parsed URL's normalized `href`, or `null` if invalid.
 */
export const validateOutboundUrl = (
  raw: string | null | undefined,
): string | null => {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (!parsed.hostname) return null;
  return parsed.href;
};

/**
 * Appends standard UTM tracking parameters to an external outbound destination URL.
 * Respects existing UTM parameters if already present in the destination URL.
 */
export const appendOutboundUtm = (
  rawUrl: string,
  options?: OutboundUtmOptions,
): string => {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl);
    const source = options?.source || "health.j172.tw";
    const medium = options?.medium || "referral";
    const campaign = options?.campaign;
    const content = options?.content;
    const term = options?.term;

    // Respect existing utm_source if upstream already defined one
    if (!parsed.searchParams.has("utm_source")) {
      parsed.searchParams.set("utm_source", source);
    }
    if (medium && !parsed.searchParams.has("utm_medium")) {
      parsed.searchParams.set("utm_medium", medium);
    }
    if (campaign && !parsed.searchParams.has("utm_campaign")) {
      parsed.searchParams.set("utm_campaign", campaign);
    }
    if (content && !parsed.searchParams.has("utm_content")) {
      parsed.searchParams.set("utm_content", content);
    }
    if (term && !parsed.searchParams.has("utm_term")) {
      parsed.searchParams.set("utm_term", term);
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

import { isGovSource } from "@/lib/server/news/sourceCategories";

export interface ArticleLinkDestination {
  href: string;
  isExternal: boolean;
  target?: "_blank";
  rel?: "noopener noreferrer";
}

/**
 * Determines whether a news card should open the internal detail page (official gov sources)
 * or link out directly in a new tab to the publisher with UTM tracking (non-gov media, blogs, NPOs).
 */
export const getArticleDestination = (
  item: {
    id: number;
    source_name?: string | null;
    canonical_url?: string | null;
  },
  medium = "news_card",
): ArticleLinkDestination => {
  const isGov = isGovSource(item.source_name || "");
  if (isGov && item.id > 0) {
    return {
      href: `/news/${item.id}`,
      isExternal: false,
    };
  }

  const rawUrl = item.canonical_url;
  if (rawUrl && /^https?:\/\//i.test(rawUrl)) {
    const tagged = appendOutboundUtm(rawUrl, {
      medium,
      campaign: "news_source",
    });
    return {
      href: tagged,
      isExternal: true,
      target: "_blank",
      rel: "noopener noreferrer",
    };
  }

  return {
    href: item.id > 0 ? `/news/${item.id}` : "/news",
    isExternal: false,
  };
};

/**
 * Builds direct outbound link for an external article URL with standard UTM parameters.
 * Links directly to the original publisher without intermediate /out interstitial or delay.
 */
export const buildOutboundLink = (
  url: string,
  options?: OutboundUtmOptions,
): string => {
  return appendOutboundUtm(url, {
    medium: "news_outbound",
    campaign: "news_source",
    ...options,
  });
};

