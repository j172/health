declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/**
 * Tracks a page_view event in Google Analytics 4.
 * Useful for Next.js App Router client-side SPA route transitions.
 */
export function trackPageView(path: string, title?: string): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", "page_view", {
    page_location: window.location.href,
    page_path: path,
    page_title: title || document.title,
  });
}

/**
 * Tracks user search interaction within tool search inputs.
 */
export function trackToolSearch(
  term: string,
  resultCount: number,
  source: string = "home_launchpad",
): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", "tool_search", {
    search_term: term,
    result_count: resultCount,
    search_source: source,
  });
}

/**
 * Tracks tool launch/click events across Launchpad, Directory, and Quick Pills.
 */
export function trackToolLaunch(
  slug: string,
  group?: string,
  tab?: string,
): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", "tool_launch", {
    tool_slug: slug,
    tool_group: group || "unknown",
    tool_tab: tab || null,
  });
}

/**
 * Tracks category pill and tab switches.
 */
export function trackCategoryClick(
  categoryName: string,
  source: string = "tools_index",
): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", "tool_category_click", {
    category_name: categoryName,
    source,
  });
}
