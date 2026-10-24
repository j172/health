"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  trackToolSearch,
  trackToolLaunch,
  trackCategoryClick,
} from "@/lib/client/analytics";

export interface LaunchpadToolItem {
  slug: string;
  title: string;
  navLabel?: string;
  directAnswer: string;
  keywords: string[];
  group: string;
}

interface ToolLaunchpadProps {
  tools: LaunchpadToolItem[];
}

const QUICK_PILLS = [
  { slug: "er-status", title: "急診即時看板", icon: "🚑", href: "/tools/er-status", group: "medical-care" },
  { slug: "clinics", title: "健保特約診所", icon: "🏥", href: "/tools/clinics", group: "medical-care" },
  { slug: "aed", title: "AED 急救地圖", icon: "⚡", href: "/tools/aed", group: "medical-care" },
  { slug: "disaster-map", title: "防災避難地圖", icon: "🌀", href: "/tools/disaster-map", group: "disaster-alerts" },
  { slug: "anti-fraud", title: "165 反詐騙", icon: "🛡️", href: "/tools/anti-fraud", group: "life-culture" },
  { slug: "water-conditions", title: "即時水庫水情", icon: "🚰", href: "/tools/water-conditions", group: "disaster-alerts" },
  { slug: "public-toilets", title: "全臺公廁導航", icon: "🚻", href: "/tools/public-toilets", group: "life-culture" },
  { slug: "cpc-prices", title: "即時油價與加油站", icon: "⛽", href: "/tools/cpc-prices", group: "life-culture" },
];

const CATEGORIES = [
  { id: "health-assessment", label: "健康自我評估", icon: "⚖️" },
  { id: "medical-care", label: "就醫與用藥", icon: "🩺" },
  { id: "elder-care-welfare", label: "長照與社會福利", icon: "🏡" },
  { id: "family", label: "婦幼與家庭", icon: "👶" },
  { id: "disaster-alerts", label: "防災與示警", icon: "🚨" },
  { id: "environment-food", label: "環境與食品安全", icon: "🌿" },
  { id: "life-culture", label: "交通、生活與文化", icon: "🚲" },
];

export default function ToolLaunchpad({ tools }: ToolLaunchpadProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Keyboard shortcut listener (/ or ⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in another input/textarea
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") {
        if (e.key === "Escape" && document.activeElement === inputRef.current) {
          inputRef.current?.blur();
          setIsFocused(false);
        }
        return;
      }

      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setIsFocused(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filter matching tools
  const searchResults = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("zh-TW");
    if (!q) return [];

    return tools
      .filter((tool) => {
        const titleMatch = tool.title.toLocaleLowerCase("zh-TW").includes(q);
        const navLabelMatch = tool.navLabel?.toLocaleLowerCase("zh-TW").includes(q);
        const directAnswerMatch = tool.directAnswer.toLocaleLowerCase("zh-TW").includes(q);
        const keywordMatch = tool.keywords.some((k) =>
          k.toLocaleLowerCase("zh-TW").includes(q),
        );
        return titleMatch || navLabelMatch || directAnswerMatch || keywordMatch;
      })
      .slice(0, 8);
  }, [query, tools]);

  // Track search query with debounce
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const timer = setTimeout(() => {
      trackToolSearch(trimmed, searchResults.length, "home_launchpad");
    }, 600);

    return () => clearTimeout(timer);
  }, [query, searchResults.length]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % searchResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = searchResults[selectedIndex] || searchResults[0];
      if (target) {
        trackToolLaunch(target.slug, target.group);
        router.push(`/tools/${target.slug}`);
        setIsFocused(false);
      }
    } else if (e.key === "Escape") {
      setIsFocused(false);
      inputRef.current?.blur();
    }
  };

  return (
    <section
      ref={containerRef}
      aria-label="全臺便民生活工具發射台"
      className="mb-8 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/70 p-5 shadow-xs backdrop-blur-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950/70"
    >
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl" role="img" aria-hidden="true">🚀</span>
            <h2 className="text-base font-extrabold tracking-tight text-slate-900 sm:text-lg dark:text-slate-100">
              便民工具快速發射台
            </h2>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300">
              {tools.length} 款民生工具
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            免安裝・全臺公衛、醫療照護、防災交通開放資料即時查詢
          </p>
        </div>

        <Link
          href="/tools"
          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 sm:mt-0 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <span>查看工具總覽</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {/* Instant Search Bar */}
      <div className="relative mt-4">
        <div className="relative flex items-center">
          <span
            className="pointer-events-none absolute left-3.5 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          >
            🔍
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
              setIsFocused(true);
            }}
            onFocus={() => setIsFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder="搜尋工具名稱、症狀、急救、長照、水情、油價或生活補助..."
            aria-label="即時搜尋便民工具"
            aria-autocomplete="list"
            aria-expanded={isFocused && query.trim().length > 0}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-20 text-sm text-slate-900 placeholder-slate-400 shadow-2xs transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-indigo-400"
          />
          <div className="pointer-events-none absolute right-3 hidden items-center gap-1 sm:flex">
            <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-700/80 dark:text-slate-300">
              /
            </kbd>
            <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-700/80 dark:text-slate-300">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Live Search Autocomplete Dropdown */}
        {isFocused && query.trim().length > 0 && (
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            {searchResults.length > 0 ? (
              searchResults.map((tool, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <Link
                    key={tool.slug}
                    href={`/tools/${tool.slug}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      trackToolLaunch(tool.slug, tool.group);
                      setIsFocused(false);
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200"
                        : "hover:bg-slate-50 text-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">
                          {tool.navLabel || tool.title}
                        </span>
                        <span className="text-[10px] text-slate-600 dark:text-slate-400">
                          {tool.slug}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-slate-600 dark:text-slate-400">
                        {tool.directAnswer}
                      </p>
                    </div>
                    <span className="text-slate-600 dark:text-slate-400" aria-hidden="true">→</span>
                  </Link>
                );
              })
            ) : (
              <div className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                查無與「{query}」完全相符的工具。試試「急診」、「診所」、「AED」或「長照」？
              </div>
            )}
          </div>
        )}
      </div>

      {/* 8 High-frequency civil tools (Quick Pills) */}
      <div className="mt-4">
        <div className="mb-2 text-[11px] font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400">
          高頻民生快查
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUICK_PILLS.map((pill) => (
            <Link
              key={pill.slug}
              href={pill.href}
              onClick={() => trackToolLaunch(pill.slug, pill.group)}
              className="group flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-600 hover:shadow-xs dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:bg-slate-800/80 dark:hover:text-indigo-300"
            >
              <span className="text-base transition-transform group-hover:scale-110" aria-hidden="true">
                {pill.icon}
              </span>
              <span className="truncate">{pill.title}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* 7 Category Quick Shortcuts */}
      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800/80">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400">
            依主題分類快速直達
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.id}
              href={`/tools#${cat.id}`}
              onClick={() => trackCategoryClick(cat.label, "home_launchpad")}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2.5 py-1.5 text-xs text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
            >
              <span aria-hidden="true">{cat.icon}</span>
              <span>{cat.label}</span>
            </Link>
          ))}
          <Link
            href="/tools"
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
          >
            <span>全部 85+ 工具 →</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
