"use client";

/**
 * components/Common/InAppBrowserBanner.tsx
 *
 * Site-wide, dismissible warning shown when the page is loaded inside a
 * chat/social app's in-app browser (LINE / Facebook / Instagram / WeChat)
 * rather than the user's real system browser. See
 * docs/specs/in-app-browser-warning-banner.md.
 *
 * ## Why "copy link", not a one-click "open in Safari/Chrome" button
 *
 * Before building this, we checked whether a reliable forced-redirect trick
 * still works in 2026 for these four in-app browsers on iOS and Android. It
 * does not, on either platform:
 *   - LINE's own developer docs (2026-05) tell integrators to fall back to
 *     "ask the user to reopen the page in Safari/Chrome" precisely because
 *     programmatic launch-out is not dependable and regresses across app/OS
 *     updates.
 *   - Facebook/Instagram's webview intercepts `intent://` / custom-scheme
 *     redirects; the only documented reliable exit is the user tapping the
 *     in-app browser's own "..." menu and choosing "Open in external
 *     browser" (Android) or (on iOS) there is no menu equivalent at all for
 *     some hosts, and the OS gives third-party pages no API to force a
 *     switch to Safari.
 *   - WeChat's webview has blocked `intent://`-based Chrome launches since
 *     at least 2017 and still does in 2026; guidance is the same "Copy
 *     Link" + manual-open pattern.
 *
 * Shipping a fake one-click button here would fail silently for a chunk of
 * users and erode trust in the warning itself, so this renders a "copy
 * link" action plus short instructions instead, per the spec's explicit
 * fallback direction.
 */

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { detectInAppBrowser, type InAppBrowserApp } from "@/lib/client/inAppBrowser";

const DISMISS_KEY = "inapp_browser_banner_dismissed";

// `navigator.userAgent` doesn't exist during SSR and doesn't change over the
// life of the tab, so detection is read through useSyncExternalStore (same
// pattern as PrivacyConsentBanner's ack flag below) rather than
// useState+useEffect: React handles the "nothing on the server, real value on
// the client" mismatch for us instead of us calling setState from an effect.
const noopSubscribe = () => () => {};

const getAppSnapshot = (): InAppBrowserApp | null => {
  if (typeof navigator === "undefined") return null;
  return detectInAppBrowser(navigator.userAgent).app;
};

const getAppServerSnapshot = (): InAppBrowserApp | null => null;

const subscribeToStorage = (callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

const getDismissedSnapshot = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

const getDismissedServerSnapshot = (): boolean => true;

const APP_LABEL: Record<InAppBrowserApp, string> = {
  line: "LINE",
  facebook: "Facebook",
  instagram: "Instagram",
  wechat: "微信（WeChat）",
};

// Where each app tucks its "open in real browser" menu item, so the
// instruction text can point at the right spot instead of a generic "找選單".
const APP_HINT: Record<InAppBrowserApp, string> = {
  line: "點右上角「⋯」選單，選擇「在外部瀏覽器開啟」",
  facebook: "點右上角「⋯」選單，選擇「在瀏覽器中開啟」",
  instagram: "點右上角「⋯」選單，選擇「在瀏覽器中開啟」",
  wechat: "點右上角「⋯」選單，選擇「在瀏覽器開啟」",
};

function persistDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // localStorage unavailable (e.g. private mode) — the banner will simply
    // reappear next page load, which is a harmless degradation.
  }
}

export default function InAppBrowserBanner() {
  // Server-rendered/first-hydration-pass state is always "nothing" (the
  // *ServerSnapshot values below), which is what keeps this component from
  // taking any layout space, or causing a hydration mismatch, for the
  // overwhelming majority of visitors who are not in one of these in-app
  // browsers. React schedules the follow-up client render itself once real
  // snapshots are available post-hydration.
  const app = useSyncExternalStore(noopSubscribe, getAppSnapshot, getAppServerSnapshot);
  const dismissedInStorage = useSyncExternalStore(
    subscribeToStorage,
    getDismissedSnapshot,
    getDismissedServerSnapshot,
  );
  // A same-tab, same-session close doesn't fire the `storage` event (that
  // only fires in *other* tabs), so it needs its own flag — same trick
  // PrivacyConsentBanner uses for its ack button.
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  // `/admin/*` is internal ops tooling, not a consumer-facing page, so it's
  // exempt (per the spec). This component is mounted from the true root
  // layout (app/layout.tsx) because that's the only layout that already
  // covers every consumer route (/, /news, /tools, /privacy, /llm-info, ...)
  // — there is no shared layout that covers exactly "every consumer page but
  // not /admin" without restructuring the route tree — so the exclusion is
  // enforced here at runtime instead.
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin") ?? false;

  if (isAdminRoute || !app || dismissedInStorage || dismissed) return null;

  const handleDismiss = () => {
    persistDismissed();
    setDismissed(true);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable/blocked inside some in-app
      // webviews — the instructional text below still gets the user there.
      setCopied(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="使用外部瀏覽器提醒"
      className="fixed inset-x-0 top-0 z-[60] border-b border-amber-200 bg-amber-50/95 px-4 py-3 shadow-[0_4px_12px_rgba(0,0,0,0.06)] backdrop-blur dark:border-amber-900 dark:bg-amber-950/95 sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-100 sm:text-sm">
          您正在 {APP_LABEL[app]} 內建瀏覽器中瀏覽，部分功能（例如定位、複製連結）可能無法正常運作。
          建議改用外部瀏覽器開啟本站：{APP_HINT[app]}，或點右方「複製連結」後貼到瀏覽器開啟。
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 sm:text-sm"
          >
            {copied ? "已複製連結" : "複製連結"}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="關閉提醒"
            className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-900 sm:text-sm"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
