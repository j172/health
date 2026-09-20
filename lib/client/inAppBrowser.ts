/**
 * lib/client/inAppBrowser.ts
 *
 * Detects whether the current page is running inside a chat/social app's
 * built-in "in-app browser" (a stripped-down WebView), as opposed to the
 * user's actual system browser (Safari, Chrome, ...).
 *
 * Why this matters: in-app webviews frequently have compatibility gaps with
 * things this site relies on — the Geolocation permission prompt, the
 * Clipboard API, service workers/PWA install, sometimes even IndexedDB —
 * because each host app ships its own cut-down WebView shell rather than the
 * OS's real browser engine. See docs/specs/in-app-browser-warning-banner.md.
 *
 * Pure function, no DOM/`navigator` access here — the caller (a client
 * component) passes `navigator.userAgent` in explicitly, which keeps this
 * module trivially unit-testable and safe to import from anywhere.
 */

export type InAppBrowserApp = "line" | "facebook" | "instagram" | "wechat";

export interface InAppBrowserInfo {
  isInAppBrowser: boolean;
  app: InAppBrowserApp | null;
}

// Checked in this order so a UA carrying more than one token (e.g. some
// Meta-family webviews) still resolves to the more specific app rather than
// a generic one.
const DETECTORS: Array<{ app: InAppBrowserApp; pattern: RegExp }> = [
  { app: "instagram", pattern: /Instagram/i },
  { app: "facebook", pattern: /FBAN|FBAV/ },
  { app: "line", pattern: /Line\// },
  { app: "wechat", pattern: /MicroMessenger/ },
];

/**
 * Identify a LINE / Facebook (incl. Messenger) / Instagram / WeChat in-app
 * browser from a User-Agent string.
 *
 * Returns `{ isInAppBrowser: false, app: null }` for anything else, including
 * a normal desktop or mobile Safari/Chrome UA, an empty string, or a missing
 * value (SSR has no `navigator.userAgent`).
 */
export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowserInfo {
  if (!userAgent) return { isInAppBrowser: false, app: null };

  for (const { app, pattern } of DETECTORS) {
    if (pattern.test(userAgent)) {
      return { isInAppBrowser: true, app };
    }
  }

  return { isInAppBrowser: false, app: null };
}
