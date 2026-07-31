"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { type NewsListItem } from "@/lib/server/news/queries";
import { getSourceBadgeStyle } from "@/lib/server/news/sourceCategories";

const stripHtml = (html: string | null | undefined): string =>
  (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const toTaipei = (value: Date | string | null): string => {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(
    new Date(value),
  );
};

export default function SearchModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NewsListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  // Debounced search API call
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/news/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch (err) {
        console.error("Failed to search:", err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-99999 flex items-start justify-center p-4 pt-16 sm:pt-24 bg-slate-950/60 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Input */}
        <div className="relative flex items-center border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
          <svg
            className="h-5 w-5 text-indigo-500 dark:text-indigo-400 shrink-0"
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋健康新聞、疫苗、疾病防制、藥品..."
            className="w-full bg-transparent px-3 text-base text-slate-800 placeholder-slate-400 outline-none dark:text-slate-100 dark:placeholder-slate-500"
          />
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent dark:border-indigo-400" />
          )}
          {query && !loading && (
            <button
              onClick={() => setQuery("")}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800"
            >
              清除
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="關閉搜尋"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Results Body */}
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {query.trim() === "" ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              輸入關鍵字以搜尋各大公衛與媒體健康新聞...
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {["登革熱", "流感疫苗", "食安特報", "高血壓", "心血管"].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              找不到與「<span className="font-semibold text-slate-600 dark:text-slate-300">{query}</span>」相關的新聞報導
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((item) => {
                const badgeStyle = getSourceBadgeStyle(item.source_name);
                return (
                  <Link
                    key={item.id}
                    href={`/news/${item.id}`}
                    onClick={onClose}
                    className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-indigo-50/70 dark:hover:bg-slate-800/80"
                  >
                    {item.card_image_url ? (
                      <img
                        src={item.card_image_url}
                        alt=""
                        className="h-14 w-20 shrink-0 rounded-lg object-cover bg-slate-100 dark:bg-slate-800"
                      />
                    ) : (
                      <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 font-bold text-xs">
                        Health
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${badgeStyle.bg} ${badgeStyle.text}`}>
                          {item.feed_name}
                        </span>
                      <span className="text-[11px] text-slate-400">
                        {toTaipei(item.published_at_utc)}
                      </span>
                    </div>
                    <h4 className="mt-1 text-sm font-semibold text-slate-800 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400 line-clamp-1">
                      {item.title}
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                      {stripHtml(item.description_html)}
                    </p>
                  </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Search Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-900/50">
          <span>Esc 關閉搜尋</span>
          {results.length > 0 && (
            <Link
              href={`/news?keyword=${encodeURIComponent(query)}`}
              onClick={onClose}
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              檢視所有符合結果 →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
