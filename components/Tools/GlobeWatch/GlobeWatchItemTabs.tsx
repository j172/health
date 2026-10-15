"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import { buildLocalizedPath, splitLocalePrefix } from "@/lib/i18n/translatedPages";
import { GLOBE_WATCH_ITEMS } from "@/lib/tools/globeWatch/items";

/**
 * Issue #588 (parent #583): minimal "單選分頁" item switcher for
 * `/tools/global-watch/*`, reading `GLOBE_WATCH_ITEMS` so a later item only
 * ever needs to grow that array. Highlights the active item from the
 * current (locale-stripped) pathname and builds each link through
 * `buildLocalizedPath` so it stays correct under `/en/`, `/ja/`, `/ko/`.
 *
 * Issue #589 (parent #583): now renders `item.label[locale]` instead of
 * the single zh-only `labelDefault` — #588 shipped the latter when there
 * was only one item (no locale-mismatch was visible yet with a single,
 * unambiguous 🌍 emoji + "地震" tab); landing 國際疫情 as a second tab made
 * the gap real on the `/en/`/`/ja/`/`/ko/` pages, so `items.ts`'s registry
 * grew a `label` map and this is its only consumer. Falls back to
 * `labelDefault` if a locale is somehow missing from the map (defensive;
 * `Record<Locale, string>` already requires every locale at the type
 * level, so this should never actually trigger).
 */
export default function GlobeWatchItemTabs() {
  const pathname = usePathname() ?? "/tools/global-watch";
  const { locale } = useLanguage();
  const { canonicalPath } = splitLocalePrefix(pathname);

  return (
    <div role="tablist" aria-label="全球動態地球項目" className="mb-4 flex flex-wrap gap-2">
      {GLOBE_WATCH_ITEMS.map((item) => {
        const isActive = canonicalPath === item.path;
        return (
          <Link
            key={item.key}
            href={buildLocalizedPath(item.path, locale)}
            role="tab"
            aria-selected={isActive}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-indigo-600 text-white shadow-xs dark:bg-indigo-500"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            <span aria-hidden="true">{item.emoji}</span>
            <span>{item.label[locale] ?? item.labelDefault}</span>
          </Link>
        );
      })}
    </div>
  );
}
