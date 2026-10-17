"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type NewsListItem } from "@/lib/server/news/queries";
import { getSourceBadgeStyle } from "@/lib/server/news/sourceCategories";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import FactCheckNotice from "@/components/News/FactCheckNotice";
import { toTaipei, stripHtml, displayDate } from "@/lib/format/news";
import { useModalA11y } from "@/components/ui/useModalA11y";
import { useLanguage } from "@/app/context/LanguageContext";
import { searchTools } from "@/lib/server/tools/catalog";
import CardThumb from "@/components/News/CardThumb";

// Issue #452's own combined-list keyboard navigation. A pure function (no
// React, no DOM) so it can be unit-tested directly: given how many results
// there are in total (tools + news, in display order) and the currently
// highlighted index (-1 = nothing highlighted yet), return the next index
// after an ArrowUp (direction -1) or ArrowDown (direction 1) press. Clamps
// at both ends instead of wrapping — pressing ArrowDown on the last result
// (or ArrowUp with nothing selected yet) lands on/stays at a valid index
// rather than cycling, which is the simplest behaviour to predict and test.
export function moveSelectedIndex(
  current: number,
  total: number,
  direction: 1 | -1,
): number {
  if (total <= 0) return -1;
  return Math.max(0, Math.min(total - 1, current + direction));
}

const ToolIcon = () => (
  <svg
    className="h-4 w-4 shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94L14.7 6.3z"
    />
  </svg>
);

export default function SearchModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t, tDynamic, locale } = useLanguage();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NewsListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setQuery("");
    setResults([]);
    setLoading(false);
    setSelectedIndex(-1);
    onClose();
  }, [onClose]);

  // Every place the query text changes also invalidates whatever was
  // highlighted for the previous query — done here, at the call site,
  // rather than in a useEffect keyed on `query` (which would call setState
  // synchronously inside an effect, a pattern this repo's lint config flags).
  const updateQuery = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(-1);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Tool results: fully client-side and synchronous (searchTools is a pure
  // in-memory filter over TOOL_CATALOG, no network round-trip), so they're
  // computed on every keystroke rather than inside the news debounce below —
  // there's no latency to hide, and showing them immediately while the news
  // results are still debouncing/loading feels more responsive. Passing a
  // `translate` callback lets a non-zh-TW search also match a tool's
  // navLabel (shorter than its SEO `title`, and not itself part of
  // searchTools' default haystack) and its locale-translated label, per
  // catalog.ts's documented `searchTools` contract. Capped at 5 so the tool
  // section can't push every news result below the fold.
  const toolResults = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return searchTools(trimmed, (tool) => {
      const zhLabel = tool.navLabel ?? tool.title;
      return locale !== "zh-TW" ? t(`catalog.${tool.slug}`, zhLabel) : zhLabel;
    }).slice(0, 5);
  }, [query, locale, t]);

  // Debounced search API call
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/news/search?q=${encodeURIComponent(trimmed)}`,
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch (err) {
        console.error("Failed to search:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Tools first, then news — the same order they're rendered in below — so
  // ArrowUp/ArrowDown/Enter walk one combined list across both sections.
  const combinedHrefs = useMemo(
    () => [
      ...toolResults.map((tool) => `/tools/${tool.slug}`),
      ...results.map((item) => `/news/${item.id}`),
    ],
    [toolResults, results],
  );
  const clampedIndex =
    combinedHrefs.length === 0
      ? -1
      : Math.min(selectedIndex, combinedHrefs.length - 1);

  // Escape, focus trap, focus restore and background scroll lock.
  const dialogRef = useModalA11y({
    isOpen,
    onClose: handleClose,
    initialFocusRef: inputRef,
  });

  // ArrowUp/ArrowDown move the highlight, Enter opens it. Scoped to while
  // the modal is open, window-level like useModalA11y's own Escape/Tab
  // listener above, so it keeps working even if focus is briefly on the
  // clear/close button instead of the input.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((idx) =>
          moveSelectedIndex(idx, combinedHrefs.length, 1),
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((idx) =>
          moveSelectedIndex(idx, combinedHrefs.length, -1),
        );
      } else if (event.key === "Enter" && clampedIndex >= 0) {
        event.preventDefault();
        const href = combinedHrefs[clampedIndex];
        handleClose();
        router.push(href);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, combinedHrefs, clampedIndex, handleClose, router]);

  if (!isOpen) return null;

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-99999 flex items-start justify-center bg-slate-950/60 p-4 pt-16 backdrop-blur-md transition-opacity duration-200 sm:pt-24"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.searchPlaceholder", "搜尋新聞")}
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Input */}
        <div className="relative flex items-center border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
          <svg
            className="h-5 w-5 shrink-0 text-indigo-500 dark:text-indigo-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            placeholder={t(
              "search.placeholder",
              "搜尋健康新聞、疫苗、疾病防制、藥品...",
            )}
            role="combobox"
            aria-expanded={combinedHrefs.length > 0}
            aria-controls="search-results-listbox"
            aria-activedescendant={
              clampedIndex >= 0 ? `search-result-${clampedIndex}` : undefined
            }
            className="w-full bg-transparent px-3 text-base text-slate-800 placeholder-slate-400 outline-none dark:text-slate-100 dark:placeholder-slate-500"
          />
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent dark:border-indigo-400" />
          )}
          {query && !loading && (
            <button
              onClick={() => updateQuery("")}
              className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 hover:text-slate-600 dark:bg-slate-800 dark:hover:text-slate-200"
            >
              {t("search.clear", "清除")}
            </button>
          )}
          <button
            onClick={handleClose}
            className="ml-2 rounded-lg p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label={t("search.close", "關閉搜尋")}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Search Results Body */}
        <div
          id="search-results-listbox"
          role="listbox"
          aria-label={t("search.placeholder", "搜尋健康新聞、疫苗、疾病防制、藥品...")}
          className="max-h-[60vh] overflow-y-auto p-3"
        >
          {query.trim() === "" ? (
            <div className="py-10 text-center text-sm text-slate-600 dark:text-slate-500">
              輸入關鍵字以搜尋各大公衛與媒體健康新聞...
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {["登革熱", "流感疫苗", "食安特報", "高血壓", "心血管"].map(
                  (tag) => (
                    <button
                      key={tag}
                      onClick={() => updateQuery(tag)}
                      className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900"
                    >
                      #{tag}
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : (
            <>
              {toolResults.length > 0 && (
                <div className="mb-2 space-y-1">
                  <div className="px-3 pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-slate-600 dark:text-slate-500">
                    {t("search.tools", "工具")}
                  </div>
                  {toolResults.map((tool, i) => {
                    const zhLabel = tool.navLabel ?? tool.title;
                    const label =
                      locale !== "zh-TW"
                        ? t(`catalog.${tool.slug}`, zhLabel)
                        : zhLabel;
                    const isSelected = i === clampedIndex;
                    return (
                      <Link
                        key={tool.slug}
                        id={`search-result-${i}`}
                        role="option"
                        aria-selected={isSelected}
                        href={`/tools/${tool.slug}`}
                        onClick={handleClose}
                        className={`group flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-emerald-50/70 dark:hover:bg-slate-800/80 ${
                          isSelected
                            ? "bg-emerald-50/70 dark:bg-slate-800/80"
                            : ""
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <ToolIcon />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              {t("search.tools", "工具")}
                            </span>
                          </div>
                          <h4 className="mt-1 line-clamp-1 text-sm font-semibold text-slate-800 group-hover:text-emerald-600 dark:text-slate-100 dark:group-hover:text-emerald-400">
                            {label}
                          </h4>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {results.length === 0 && !loading ? (
                <div className="py-10 text-center text-sm text-slate-600 dark:text-slate-500">
                  找不到與「
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {query}
                  </span>
                  」相關的新聞報導
                </div>
              ) : (
                <div className="space-y-1">
                  {results.length > 0 && (
                    <div className="px-3 pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-slate-600 dark:text-slate-500">
                      {t("search.news", "新聞")}
                    </div>
                  )}
                  {results.map((item, i) => {
                    const badgeStyle = getSourceBadgeStyle(item.source_name);
                    const index = toolResults.length + i;
                    const isSelected = index === clampedIndex;
                    return (
                      <Link
                        key={item.id}
                        id={`search-result-${index}`}
                        role="option"
                        aria-selected={isSelected}
                        href={`/news/${item.id}`}
                        onClick={onClose}
                        className={`group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-indigo-50/70 dark:hover:bg-slate-800/80 ${
                          isSelected
                            ? "bg-indigo-50/70 dark:bg-slate-800/80"
                            : ""
                        }`}
                      >
                        <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                          <CardThumb item={item} sizes="80px" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${badgeStyle.bg} ${badgeStyle.text}`}
                            >
                              {item.feed_name}
                            </span>
                            <span className="text-[11px] text-slate-600">
                              {toTaipei(displayDate(item))}
                            </span>
                          </div>
                          <h4 className="mt-1 line-clamp-1 text-sm font-semibold text-slate-800 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                            {tDynamic(item.title)}
                          </h4>
                          <FactCheckNotice
                            sourceName={item.source_name}
                            sourceLabel={resolveAuthorLabel(item)}
                            className="mt-0.5"
                          />
                          <p className="mt-0.5 line-clamp-1 text-xs text-slate-600 dark:text-slate-400">
                            {stripHtml(item.description_html)}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Search Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-500">
          <span>{t("search.escHint", "Esc 關閉搜尋")}</span>
          {results.length > 0 && (
            <Link
              href={`/news?keyword=${encodeURIComponent(query)}`}
              onClick={onClose}
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {t("search.viewAll", "檢視所有符合結果")} →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
