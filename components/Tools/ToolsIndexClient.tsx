"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import {
  trackToolSearch,
  trackToolLaunch,
  trackCategoryClick,
} from "@/lib/client/analytics";

export interface ToolItemData {
  slug: string;
  title: string;
  navLabel?: string;
  directAnswer: string;
  keywords: string[];
  group: string;
  icon?: string;
  tab?: string;
  isSubTool?: boolean;
  parentTitle?: string;
}

export interface CategorySectionData {
  group: string;
  label: string;
  description: string;
  tools: ToolItemData[];
}

interface ToolsIndexClientProps {
  categories: CategorySectionData[];
  toolIcons: Record<string, string>;
  totalCount: number;
}

export const DECONSTRUCTED_SUB_TOOLS: ToolItemData[] = [
  {
    slug: "green-certifications",
    tab: "green-hotels",
    title: "綠色旅宿（環保旅館）",
    navLabel: "綠色旅宿",
    directAnswer: "全臺通過環境部認證之環保標章旅館與綠色旅宿清單，落實節能減碳與綠色旅遊住宿指南。",
    keywords: ["綠色旅宿", "環保旅館", "環保飯店", "綠色旅遊", "環保標章"],
    group: "environment-food",
    icon: "🏨",
    isSubTool: true,
    parentTitle: "環保標章認證",
  },
  {
    slug: "green-certifications",
    tab: "green-restaurants",
    title: "綠色餐廳（環保餐廳）",
    navLabel: "綠色餐廳",
    directAnswer: "查詢環境部認證綠色餐廳，提供源頭減量、在地食材與環保減塑餐飲消費指引。",
    keywords: ["綠色餐廳", "環保餐廳", "惜食餐廳", "在地食材", "環保標章"],
    group: "environment-food",
    icon: "🍽️",
    isSubTool: true,
    parentTitle: "環保標章認證",
  },
  {
    slug: "cpc-prices",
    tab: "stations",
    title: "中油加油站服務據點地圖",
    navLabel: "中油加油站",
    directAnswer: "全臺中油直營與加盟加油站地圖，提供即時洗車、充電樁、機車換電與複合服務據點導航。",
    keywords: ["加油站", "中油加油站", "洗車", "充電站", "機車換電", "CPC"],
    group: "life-culture",
    icon: "⛽",
    isSubTool: true,
    parentTitle: "中油油價牌價",
  },
  {
    slug: "water-conditions",
    tab: "reservoir-status",
    title: "水庫即時水情與蓄水量",
    navLabel: "水庫即時水情",
    directAnswer: "即時查詢全臺主要水庫有效蓄水量、蓄水率百分比、水位變化與放水警戒動態。",
    keywords: ["水庫", "水情", "蓄水量", "蓄水率", "水庫水情", "水利署"],
    group: "disaster-alerts",
    icon: "🏞️",
    isSubTool: true,
    parentTitle: "水利署水情資訊",
  },
];

export default function ToolsIndexClient({
  categories,
  toolIcons,
  totalCount,
}: ToolsIndexClientProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initialize activeCategory from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && categories.some((c) => c.group === hash)) {
      setActiveCategory(hash);
    }
  }, [categories]);

  // Merge deconstructed sub-tools into categories
  const categoriesWithSubTools = useMemo(() => {
    return categories.map((cat) => {
      const subToolsForCat = DECONSTRUCTED_SUB_TOOLS.filter(
        (st) => st.group === cat.group,
      );
      // Avoid duplicate slug if identical
      const existingSlugs = new Set(cat.tools.map((t) => t.slug));
      const filteredSub = subToolsForCat.filter((st) => !existingSlugs.has(`${st.slug}?tab=${st.tab}`));
      return {
        ...cat,
        tools: [...cat.tools, ...filteredSub],
      };
    });
  }, [categories]);

  // Filter tools based on search query
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase("zh-TW");

    return categoriesWithSubTools
      .filter((cat) => activeCategory === "all" || cat.group === activeCategory)
      .map((cat) => {
        if (!q) return cat;

        const matchingTools = cat.tools.filter((tool) => {
          const title = tool.title.toLocaleLowerCase("zh-TW");
          const navLabel = (tool.navLabel || "").toLocaleLowerCase("zh-TW");
          const directAnswer = tool.directAnswer.toLocaleLowerCase("zh-TW");
          const keywords = (tool.keywords || []).some((k) =>
            k.toLocaleLowerCase("zh-TW").includes(q),
          );
          return (
            title.includes(q) ||
            navLabel.includes(q) ||
            directAnswer.includes(q) ||
            keywords
          );
        });

        return {
          ...cat,
          tools: matchingTools,
        };
      })
      .filter((cat) => cat.tools.length > 0);
  }, [categoriesWithSubTools, activeCategory, searchQuery]);

  const totalVisibleTools = useMemo(() => {
    return filteredCategories.reduce((acc, cat) => acc + cat.tools.length, 0);
  }, [filteredCategories]);

  // Track search query with debounce
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return;

    const timer = setTimeout(() => {
      trackToolSearch(q, totalVisibleTools, "tools_index");
    }, 600);

    return () => clearTimeout(timer);
  }, [searchQuery, totalVisibleTools]);

  const handleCategorySelect = (group: string, label: string) => {
    setActiveCategory(group);
    trackCategoryClick(label, "tools_index");

    if (group === "all") {
      window.history.replaceState(null, "", window.location.pathname);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.history.replaceState(null, "", `#${group}`);
      const targetElement = document.getElementById(`category-${group}`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Sticky Interactive Filter Bar */}
      <div className="sticky top-14 z-20 -mx-4 border-y border-slate-200/90 bg-white/95 px-4 py-3 shadow-xs backdrop-blur-md transition-all sm:mx-0 sm:rounded-2xl sm:border dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Instant Search Box */}
          <div className="relative flex-1">
            <span
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            >
              🔍
            </span>
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="頁內即時過濾：輸入工具名稱、關鍵字、症狀或補助..."
              aria-label="頁內即時過濾便民工具"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-8 text-xs text-slate-900 placeholder-slate-400 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-indigo-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="清除搜尋"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>

          {/* Results Count Badge */}
          <div className="hidden shrink-0 text-xs text-slate-500 sm:block dark:text-slate-400">
            顯示 <span className="font-bold text-indigo-600 dark:text-indigo-400">{totalVisibleTools}</span> / {totalCount + DECONSTRUCTED_SUB_TOOLS.length} 款工具
          </div>
        </div>

        {/* Sticky Category Pills */}
        <div
          role="tablist"
          aria-label="工具主題分類"
          className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === "all"}
            onClick={() => handleCategorySelect("all", "全部")}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              activeCategory === "all"
                ? "bg-indigo-600 text-white shadow-xs dark:bg-indigo-500"
                : "border border-slate-200/80 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-700"
            }`}
          >
            <span>全部</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                activeCategory === "all"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
              }`}
            >
              {totalCount + DECONSTRUCTED_SUB_TOOLS.length}
            </span>
          </button>

          {categories.map((cat) => {
            const isActive = activeCategory === cat.group;
            return (
              <button
                key={cat.group}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleCategorySelect(cat.group, cat.label)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-xs dark:bg-indigo-500"
                    : "border border-slate-200/80 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-700"
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                  }`}
                >
                  {cat.tools.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Zero Results State */}
      {filteredCategories.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="text-3xl">🔍</div>
          <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-slate-100">
            找不到符合「{searchQuery}」的工具
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            請嘗試使用其他關鍵字，或切換至「全部」分類檢視。
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setActiveCategory("all");
            }}
            className="mt-4 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            重設篩選條件
          </button>
        </div>
      )}

      {/* Categorized Tool Sections (Topic Silos) */}
      <div className="space-y-12">
        {filteredCategories.map((category) => {
          return (
            <section
              key={category.group}
              id={`category-${category.group}`}
              aria-labelledby={`heading-${category.group}`}
              className="scroll-mt-36"
            >
              <div className="mb-4">
                <h2
                  id={`heading-${category.group}`}
                  className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100"
                >
                  <Link
                    href={`/tools/category/${category.group}`}
                    className="hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                    {category.label}
                  </Link>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {category.tools.length}
                  </span>
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {category.description}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {category.tools.map((tool) => {
                  const href = tool.tab
                    ? `/tools/${tool.slug}?tab=${tool.tab}`
                    : `/tools/${tool.slug}`;

                  const icon =
                    tool.icon || toolIcons[tool.slug] || "📊";

                  return (
                    <Link
                      key={tool.isSubTool ? `${tool.slug}-${tool.tab}` : tool.slug}
                      href={href}
                      onClick={() =>
                        trackToolLaunch(tool.slug, category.group, tool.tab)
                      }
                      className="group flex flex-col rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="text-3xl transition-transform duration-200 group-hover:scale-110">
                          {icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h3 className="truncate text-sm font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                              {tool.navLabel ?? tool.title}
                            </h3>
                            {tool.isSubTool && (
                              <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.2 text-[9px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                直達分頁
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                            {tool.directAnswer}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-700 group-hover:text-indigo-600 dark:border-slate-800 dark:text-slate-300 dark:group-hover:text-indigo-400">
                        <span className="flex items-center gap-1">
                          <span>立即使用</span>
                          {tool.isSubTool && tool.parentTitle && (
                            <span className="text-[10px] text-slate-600 font-normal dark:text-slate-400">
                              ({tool.parentTitle})
                            </span>
                          )}
                        </span>
                        <span className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">
                          →
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
