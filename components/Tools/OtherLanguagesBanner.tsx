"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  ja: "日本語",
  ko: "한국어",
};

const DISMISS_KEY_PREFIX = "i18n-other-languages-dismissed:";

/**
 * Issue #485, acceptance criterion 5: the Chinese version of a translated
 * page never auto-redirects by browser language, but shows a dismissible
 * notice that other language versions exist. Rendered by ToolPageShell only
 * for slugs in TRANSLATED_TOOL_SLUGS, only while viewing the zh (unprefixed)
 * page — dismissal is remembered per-page in localStorage so it doesn't
 * reappear on every visit.
 */
export default function OtherLanguagesBanner({ canonicalPath }: { canonicalPath: string }) {
  const [dismissed, setDismissed] = useState(true); // default hidden until checked, avoids SSR/CSR flash

  useEffect(() => {
    // Deferred via queueMicrotask (same pattern as
    // lib/hooks/useSharedGeolocation.ts's own mount effect, reused
    // throughout this repo's tool content components): calling setState
    // directly and synchronously from an effect body trips
    // react-hooks/set-state-in-effect.
    queueMicrotask(() => {
      try {
        setDismissed(localStorage.getItem(DISMISS_KEY_PREFIX + canonicalPath) === "1");
      } catch {
        setDismissed(false);
      }
    });
  }, [canonicalPath]);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY_PREFIX + canonicalPath, "1");
    } catch {}
  };

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200/80 bg-indigo-50/60 px-4 py-3 text-xs text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true">🌐</span>
        <span className="font-semibold">此頁也提供其他語言版本：</span>
        {PATH_LOCALES.map((locale) => (
          <Link
            key={locale}
            href={buildLocalizedPath(canonicalPath, locale)}
            className="rounded-full border border-indigo-300 bg-white px-2.5 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950"
          >
            {LANGUAGE_LABELS[locale]}
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="關閉提示"
        className="rounded-full px-2 py-1 font-bold text-indigo-600 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-950"
      >
        ✕
      </button>
    </div>
  );
}
