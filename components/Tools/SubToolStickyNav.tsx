"use client";

import Link from "next/link";
import { trackToolLaunch } from "@/lib/client/analytics";

export interface SubToolNavItem {
  key: string;
  label: string;
  icon?: string;
  href?: string;
  count?: number;
}

interface SubToolStickyNavProps {
  items: SubToolNavItem[];
  activeKey: string;
  onChange?: (key: string) => void;
  ariaLabel?: string;
  parentSlug?: string;
}

/**
 * Sticky in-page sub-tool navigation bar for pages with multiple tabs or sub-views.
 * Sticks to top below the site navigation bar on scroll, with smooth horizontal scrolling.
 */
export default function SubToolStickyNav({
  items,
  activeKey,
  onChange,
  ariaLabel = "子工具切換",
  parentSlug,
}: SubToolStickyNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="sticky top-14 z-20 -mx-4 mb-6 border-y border-slate-200/80 bg-white/95 px-4 py-2.5 backdrop-blur-md transition-all sm:mx-0 sm:rounded-2xl sm:border dark:border-slate-800 dark:bg-slate-900/95"
    >
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex items-center gap-2 overflow-x-auto scrollbar-none"
      >
        {items.map((item) => {
          const isActive = item.key === activeKey;

          const content = (
            <>
              {item.icon && <span aria-hidden="true">{item.icon}</span>}
              <span>{item.label}</span>
              {typeof item.count === "number" && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {item.count}
                </span>
              )}
            </>
          );

          const className = `flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
            isActive
              ? "bg-indigo-600 text-white shadow-xs dark:bg-indigo-500"
              : "border border-slate-200/80 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:bg-slate-800"
          }`;

          if (item.href) {
            return (
              <Link
                key={item.key}
                href={item.href}
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  if (parentSlug) {
                    trackToolLaunch(parentSlug, undefined, item.key);
                  }
                  onChange?.(item.key);
                }}
                className={className}
              >
                {content}
              </Link>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                if (parentSlug) {
                  trackToolLaunch(parentSlug, undefined, item.key);
                }
                onChange?.(item.key);
              }}
              className={className}
            >
              {content}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
