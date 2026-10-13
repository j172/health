"use client";

import { useLanguage } from "@/app/context/LanguageContext";
import { isPathLocale } from "@/lib/i18n/dictionary";
import { getChineseOnlyNoticeDismissLabel, getChineseOnlyNoticeText } from "@/lib/i18n/chineseOnlyNotice";

/**
 * Issue #485, acceptance criterion 5: when the language switcher is used on
 * a page outside the translated-pages list, only the UI chrome (nav,
 * footer, this toast) changes language — the page body stays Chinese — so
 * this toast tells the user that explicitly instead of leaving them to
 * wonder why the body text didn't change. Mounted once, site-wide, in
 * app/(zh)/(site)/Provider.tsx; it only ever renders on the default
 * (unprefixed, zh) tree in practice, since every page reachable under
 * /en//ja//ko/ is by construction translated.
 */
export default function ChineseOnlyNoticeToast() {
  const { chineseOnlyNoticeLocale, dismissChineseOnlyNotice } = useLanguage();

  if (!chineseOnlyNoticeLocale || !isPathLocale(chineseOnlyNoticeLocale)) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-20 z-[60] mx-auto w-full max-w-md px-4 lg:bottom-6"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 text-xs leading-relaxed text-slate-700 shadow-xl backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200">
        <span className="text-base" aria-hidden="true">
          🌐
        </span>
        <p className="flex-1 font-medium">{getChineseOnlyNoticeText(chineseOnlyNoticeLocale)}</p>
        <button
          type="button"
          onClick={dismissChineseOnlyNotice}
          className="shrink-0 rounded-full px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {getChineseOnlyNoticeDismissLabel(chineseOnlyNoticeLocale)}
        </button>
      </div>
    </div>
  );
}
