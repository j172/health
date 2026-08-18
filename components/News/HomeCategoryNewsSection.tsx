"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import NewsCard from "@/components/News/NewsCard";
import { type NewsListItem } from "@/lib/server/news/queries";

interface HomeSourceCategory {
  key: string;
  label: string;
  sourceNames: string[];
}

const HOME_CARD_LIMIT = 50;

export default function HomeCategoryNewsSection({
  items,
  categories,
}: {
  items: NewsListItem[];
  categories: HomeSourceCategory[];
}) {
  const [activeCategoryKey, setActiveCategoryKey] = useState<string>("all");

  const countByCategory = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const cat of categories) {
      counts[cat.key] = items.filter((item) => cat.sourceNames.includes(item.source_name)).length;
    }
    return counts;
  }, [items, categories]);

  const visibleItems = useMemo(() => {
    if (activeCategoryKey === "all") {
      return items.slice(0, HOME_CARD_LIMIT);
    }
    const active = categories.find((cat) => cat.key === activeCategoryKey);
    if (!active) return items.slice(0, HOME_CARD_LIMIT);
    return items.filter((item) => active.sourceNames.includes(item.source_name)).slice(0, HOME_CARD_LIMIT);
  }, [items, categories, activeCategoryKey]);

  const viewAllHref = activeCategoryKey === "all" ? "/news" : `/news?group=${activeCategoryKey}`;

  return (
    <section className="space-y-9" aria-label="來源分類瀏覽新聞">
      <div className="mx-auto mb-1 max-w-3xl text-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl xl:text-4xl">
          最新健康動態與即時新聞
        </h2>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">依來源分類快速瀏覽，查看你最在意的健康資訊</p>
      </div>

      <div className="mb-1 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setActiveCategoryKey("all")}
          className={`rounded-full border px-4.5 py-2.5 text-xs font-medium capitalize duration-200 ease-in ${
            activeCategoryKey === "all"
              ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
              : "border-slate-300 bg-slate-100 text-slate-800 hover:border-slate-900 hover:bg-slate-900 hover:text-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-100 dark:hover:bg-slate-100 dark:hover:text-slate-900"
          }`}
          aria-pressed={activeCategoryKey === "all"}
        >
          全部 ({countByCategory.all ?? 0})
        </button>
        {categories.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setActiveCategoryKey(cat.key)}
            className={`rounded-full border px-4.5 py-2.5 text-xs font-medium duration-200 ease-in ${
              activeCategoryKey === cat.key
                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                : "border-slate-300 bg-slate-100 text-slate-800 hover:border-slate-900 hover:bg-slate-900 hover:text-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-100 dark:hover:bg-slate-100 dark:hover:text-slate-900"
            }`}
            aria-pressed={activeCategoryKey === cat.key}
          >
            {cat.label} ({countByCategory[cat.key] ?? 0})
          </button>
        ))}
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          目前此分類暫無可顯示的最新新聞。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => (
            <NewsCard
              key={item.id}
              item={item}
              compact
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ))}
        </div>
      )}

      <div className="flex justify-center pt-2">
        <Link
          href={viewAllHref}
          className="mt-1 rounded-md border border-slate-900 px-7.5 py-3 text-sm font-semibold text-slate-900 duration-200 ease-in hover:bg-slate-900 hover:text-white dark:border-slate-100 dark:text-slate-100 dark:hover:bg-slate-100 dark:hover:text-slate-900 lg:mt-3"
        >
          查看全部新聞 →
        </Link>
      </div>
    </section>
  );
}