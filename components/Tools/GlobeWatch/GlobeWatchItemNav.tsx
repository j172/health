"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/dictionary";
import { buildLocalizedPath } from "@/lib/i18n/translatedPages";

export interface GlobeWatchItemDef {
  key: string;
  /** Canonical (zh, unprefixed) path, e.g. "/tools/global-watch/epidemics". */
  href: string;
  label: Record<Locale, string>;
}

/**
 * Issue #589 (parent #583) — minimal, obviously-extensible item switcher for
 * `/tools/global-watch/<item>` sub-routes. #583's spec names 5 eventual
 * items (earthquakes/typhoons/disasters/epidemics/air-quality), but as of
 * this ticket only 國際疫情 (epidemics) actually has a route — issue #588
 * (地震/earthquakes) was still open with no PR when this shipped, so
 * `GLOBE_WATCH_ITEMS` lists exactly what's routable today. A future item
 * ticket's entire job here is appending one entry to this array; nothing
 * else about the component changes, which is what keeps this "minimal and
 * obviously extensible" rather than a speculative 5-tab shell with 4 dead
 * links (the same "不做『即將推出』的空頁" principle #583 applies to whole
 * pages, applied here to tabs).
 *
 * Each item is its own indexable route (not a client-side tab panel), so
 * this is a plain `<Link>` list with `usePathname()` driving the active
 * state — not `components/Tools/ToolTypeTabs.tsx`'s in-page state switcher,
 * which intentionally only mounts one tab's content at a time on a single
 * URL (the opposite of what #583 wants for global-watch's items: "每個項目
 * 都有獨立、可以被搜尋引擎收錄的網址").
 */
export const GLOBE_WATCH_ITEMS: GlobeWatchItemDef[] = [
  {
    key: "epidemics",
    href: "/tools/global-watch/epidemics",
    label: { "zh-TW": "國際疫情", en: "Epidemics", ja: "国際感染症", ko: "국제 감염병" },
  },
];

export default function GlobeWatchItemNav({ locale = "zh-TW" }: { locale?: Locale }) {
  const pathname = usePathname();

  if (GLOBE_WATCH_ITEMS.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="全球動態地球項目"
      className="mb-4 flex flex-wrap gap-2"
      data-testid="globe-watch-item-nav"
    >
      {GLOBE_WATCH_ITEMS.map((item) => {
        const href = buildLocalizedPath(item.href, locale);
        const active = pathname === href;
        return (
          <Link
            key={item.key}
            href={href}
            role="tab"
            aria-selected={active}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
              active
                ? "bg-indigo-600 text-white shadow-xs dark:bg-indigo-500"
                : "border border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-700"
            }`}
          >
            {item.label[locale] ?? item.label["zh-TW"]}
          </Link>
        );
      })}
    </div>
  );
}
