// Client-safe helpers for the /out outbound-redirect interstitial (issue #137).
// No server-only imports here — these run in both the /out server page and any
// client component that needs to build or validate an outbound link.

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

/** Builds the site-internal `/out?url=...` redirect link for an external article URL. */
export const buildOutboundLink = (url: string): string =>
  `/out?url=${encodeURIComponent(url)}`;
