"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import { buildLocalizedPath, splitLocalePrefix } from "@/lib/i18n/translatedPages";
import { GLOBE_WATCH_ITEMS } from "@/lib/tools/globeWatch/items";

/**
 * Issue #588 (parent #583): minimal "單選分頁" item switcher for
 * `/tools/global-watch/*` — currently hosts exactly one item (地震), per
 * `GLOBE_WATCH_ITEMS`'s own doc comment on staying unopinionated about
 * items that don't exist yet. Highlights the active item from the current
 * (locale-stripped) pathname and builds each link through
 * `buildLocalizedPath` so it stays correct under `/en/`, `/ja/`, `/ko/`.
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
            <span>{item.labelDefault}</span>
          </Link>
        );
      })}
    </div>
  );
}
