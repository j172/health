"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";

/**
 * Shared card shell for the geolocation-driven sidebar widgets (AQI, UV):
 * header with a colored status dot + title + refresh button, a body area
 * that switches between a loading spinner / content / empty state, and a
 * footer link to the full tool page. Each widget supplies only its label,
 * color, and body content.
 */
export default function SidebarWidgetShell({
  dotColorClass,
  title,
  onRefresh,
  refreshing,
  showSpinner,
  hasData,
  emptyMessage = "暫無測站資料",
  footerHref,
  footerLabel,
  children,
}: {
  dotColorClass: string;
  title: string;
  onRefresh: () => void;
  refreshing: boolean;
  showSpinner: boolean;
  hasData: boolean;
  emptyMessage?: string;
  footerHref: string;
  footerLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className={`absolute inline-flex h-full w-full rounded-full ${dotColorClass} animate-alert-ripple`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColorClass}`} />
          </span>
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="重新定位"
          title="重新定位"
          className="btn-press rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {showSpinner ? (
        <div className="mt-4 flex h-24 items-center justify-center">
          <LoadingOrb size={20} />
        </div>
      ) : hasData ? (
        <div className="mt-4">{children}</div>
      ) : (
        <div className="mt-4 text-center text-xs text-slate-400 py-3">{emptyMessage}</div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Link
          href={footerHref}
          className="flex items-center justify-between text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <span>{footerLabel}</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
