"use client";

import { useState, useEffect } from "react";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import defaultSeed from "@/data/health-supplements-seed.json";

export interface HealthSupplement {
  license_no: string;
  category: string | null;
  name_zh: string;
  approved_at: string | null;
  applicant: string | null;
  status: string | null;
  function_ingredients: string | null;
  function_text: string | null;
  claim: string | null;
  warning: string | null;
  notice: string | null;
  source_url: string | null;
}

const POPULAR_CATEGORIES = [
  "全部",
  "調節血脂",
  "胃腸功能改善",
  "護肝功能",
  "骨質保健",
  "不易形成體脂肪",
  "輔助調節血糖",
  "免疫調節",
  "延緩衰老",
];

export default function HealthSupplementsContent() {
  const [items, setItems] = useState<HealthSupplement[]>(defaultSeed as HealthSupplement[]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [activeOnly, setActiveOnly] = useState(true);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams();
        if (keyword.trim()) query.set("keyword", keyword.trim());
        query.set("activeOnly", activeOnly ? "true" : "false");
        query.set("limit", "100");

        const res = await fetchWithTimeout(`/api/health-supplements?${query.toString()}`, { timeoutMs: 5000 });
        if (res.ok) {
          const json = await res.json();
          if (!ignore && Array.isArray(json.results) && json.results.length > 0) {
            setItems(json.results);
            return;
          }
        }
      } catch (err) {
        console.warn("Falling back to local supplement seeds:", err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }, 0);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [keyword, activeOnly]);

  const filteredItems = items.filter((item) => {
    if (selectedCategory === "全部") return true;
    const cat = item.category || "";
    const claim = item.claim || "";
    const name = item.name_zh || "";
    return cat.includes(selectedCategory) || claim.includes(selectedCategory) || name.includes(selectedCategory);
  });

  return (
    <div className="space-y-6">
      {/* Header Info Banner */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-white p-5 shadow-xs dark:border-emerald-900/50 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-950">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-2xl text-white shadow-xs">
              💊
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                衛福部認證「小綠人」健字號健康食品登記名冊
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                依據《健康食品管理法》經食藥署嚴格人體/動物實驗審查許可之保健功效清單，杜絕誇大不實
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 sm:self-center dark:bg-emerald-900/60 dark:text-emerald-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            官方健食核准字號
          </span>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-600">
                🔍
              </span>
              <input
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋產品名稱、成分（如：紅麴、芝麻素、靈芝、兒茶素）或申請廠商..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-600 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-850 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-emerald-400"
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-700"
              />
              僅顯示目前核可有效
            </label>
          </div>

          {/* Quick Category Tags */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="mr-1 text-xs font-semibold text-slate-600 dark:text-slate-400">功效快選：</span>
            {POPULAR_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    isSelected
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
          共收錄 <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{filteredItems.length}</span>{" "}
          項健字號健康食品
          {loading && <span className="ml-2 animate-pulse text-emerald-600">（載入最新許可中...）</span>}
        </p>
      </div>

      {/* Products Grid */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <span className="text-4xl">🍃</span>
          <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">查無符合條件的健康食品</h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">請嘗試更換關鍵字或切換「全部」保健功效類別。</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredItems.map((item) => {
            const isExpanded = expandedItem === item.license_no;
            return (
              <div
                key={item.license_no}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-emerald-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-700"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {item.license_no}
                      </span>
                      <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">{item.name_zh}</h3>
                    </div>
                    {item.category && (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {item.category}
                      </span>
                    )}
                  </div>

                  {item.claim && (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:bg-slate-850 dark:text-slate-300">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">🎯 保健功效：</span>
                      {item.claim}
                    </div>
                  )}

                  <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <p>
                      <span className="font-medium text-slate-500">申請廠商：</span>
                      {item.applicant || "未知"}
                    </p>
                    {item.function_ingredients && (
                      <p>
                        <span className="font-medium text-slate-500">保健成分：</span>
                        {item.function_ingredients}
                      </p>
                    )}
                    {item.approved_at && (
                      <p>
                        <span className="font-medium text-slate-500">核准日期：</span>
                        <span className="font-mono">{item.approved_at}</span>
                      </p>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                      {item.warning && (
                        <div className="rounded-lg bg-amber-50 p-2.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          <span className="font-bold">⚠️ 警語：</span>
                          {item.warning}
                        </div>
                      )}
                      {item.notice && (
                        <p>
                          <span className="font-medium text-slate-500">注意事項：</span>
                          {item.notice}
                        </p>
                      )}
                      {item.source_url && (
                        <p>
                          <a
                            href={item.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            食藥署官方查驗許可詳細 ↗
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-2">
                  <button
                    type="button"
                    onClick={() => setExpandedItem(isExpanded ? null : item.license_no)}
                    className="text-xs font-semibold text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
                  >
                    {isExpanded ? "▲ 收合詳細標示" : "▼ 查看警語與詳細說明"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
