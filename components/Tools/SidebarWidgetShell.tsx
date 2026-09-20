"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";

/**
 * Shared card shell for the sidebar widgets: header with a colored status
 * dot + title + optional refresh button, a body area that switches between
 * four states (loading spinner / content / load-failed / genuinely-empty),
 * and a footer link to the full tool page. Each widget supplies only its
 * label, color, and body content.
 *
 * The load-failed state is deliberately distinct from the empty state (see
 * docs/specs/sidebar-widgets-unified-error-state-refactor.md) — a fetch
 * timeout/500/network error used to collapse into the exact same "暫無資料"
 * copy as a genuine "nothing today", leaving no way for a user (or a
 * developer without console access) to tell the two apart.
 */
export default function SidebarWidgetShell({
  dotColorClass,
  title,
  onRefresh,
  refreshing,
  showSpinner,
  hasData,
  hasError = false,
  emptyMessage = "暫無測站資料",
  errorMessage = "載入失敗",
  footerHref,
  footerLabel,
  children,
}: {
  dotColorClass: string;
  title: string;
  /** Omit when the widget has nothing to refresh (e.g. server-props-driven, no client fetch) — the refresh button is hidden in that case. */
  onRefresh?: () => void;
  refreshing?: boolean;
  showSpinner: boolean;
  hasData: boolean;
  /** True when the most recent fetch failed AND there is no previous data to fall back to. Ignored when `hasData` is true (stale-but-present data always wins over the error placeholder — the widget itself should surface a "may be stale" hint inline if it wants one). */
  hasError?: boolean;
  emptyMessage?: string;
  errorMessage?: string;
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
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="重新定位"
            title="重新定位"
            className="btn-press rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}
      </div>

      {showSpinner ? (
        <div className="mt-4 flex h-24 items-center justify-center">
          <LoadingOrb size={20} />
        </div>
      ) : hasData ? (
        <div className="mt-4">{children}</div>
      ) : hasError ? (
        <div className="mt-4 flex flex-col items-center justify-center gap-2 py-4 text-center">
          <svg
            className="h-6 w-6 text-red-400 dark:text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-8.25 3.75h.008v.008h-.008v-.008z" />
          </svg>
          <p className="text-xs font-medium text-red-500 dark:text-red-400">{errorMessage}</p>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="btn-press rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
            >
              點擊重試
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 text-center text-xs text-slate-600 py-3">{emptyMessage}</div>
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
