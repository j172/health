"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";
import MealAnalysisTab from "./MealAnalysisTab";
import NutrientRankingTab from "./NutrientRankingTab";
import HealthSupplementsTab from "./HealthSupplementsTab";

interface FoodSample {
  sample_id: string;
  sample_name: string | null;
  common_name: string | null;
  sample_name_en: string | null;
  food_category: string | null;
}

interface NutritionItem {
  nutrient_category: string;
  nutrient_item: string;
  unit: string | null;
  value_per_100g: string | null;
  sample_count: string | null;
  std_dev: string | null;
  value_per_unit: string | null;
  unit_weight: string | null;
  value_per_unit_weight: string | null;
}

type TabKey = "search" | "meal" | "rank" | "supplements";

const TABS: { key: TabKey; label: string }[] = [
  { key: "search", label: "成分查詢" },
  { key: "meal", label: "餐點分析" },
  { key: "rank", label: "營養素排行" },
  { key: "supplements", label: "健康食品" },
];

export default function FoodNutritionContent() {
  const [activeTab, setActiveTab] = useState<TabKey>("search");

  const [searchInput, setSearchInput] = useState("");
  const [samples, setSamples] = useState<FoodSample[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<NutritionItem[] | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Issue #157: 成分查詢 defaults to 30 results per page (switchable to 50/100), fetched
  // via /api/food-nutrition's page/pageSize params — same contract as the drugs pilot.
  const { page, pageSize, setPage, setPageSize } = usePagination();

  useEffect(() => {
    if (!searchedFor) return;
    let cancelled = false;

    // Deferred via queueMicrotask (see e4800b1 / issue #121): calling setState
    // synchronously in an effect body trips react-hooks/set-state-in-effect.
    queueMicrotask(() => {
      (async () => {
        if (cancelled) return;
        setLoading(true);
        setError(false);
        try {
          const params = new URLSearchParams({ keyword: searchedFor, page: String(page), pageSize: String(pageSize) });
          const res = await fetch(`/api/food-nutrition?${params.toString()}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          setSamples(data.samples || []);
          setTotal(typeof data.total === "number" ? data.total : 0);
        } catch {
          if (!cancelled) setError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [searchedFor, page, pageSize]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = searchInput.trim();
    if (!keyword) return;

    setSearchedFor(keyword);
    setExpandedId(null);
    setItems(null);
    setPage(1);
  };

  const toggleSample = async (sampleId: string) => {
    if (expandedId === sampleId) {
      setExpandedId(null);
      setItems(null);
      return;
    }

    setExpandedId(sampleId);
    setItems(null);
    setItemsLoading(true);
    try {
      const res = await fetch(`/api/food-nutrition?sampleId=${encodeURIComponent(sampleId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items);
    } catch {
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">🍎 食品營養成分查詢</h1>
        <p className="text-neutral-600 dark:text-slate-300">查詢衛福部食藥署食品營養成分資料庫，搜尋食品名稱以檢視每100克含量的熱量、蛋白質、脂肪、碳水化合物等營養成分。</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">⚠️ 資料為實測分析數據，同一品項不同批次可能有所差異，僅供參考。</p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1 text-sm font-semibold dark:bg-slate-800">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-md px-3 py-2 transition-all ${
              activeTab === tab.key
                ? "bg-white text-primary shadow-xs dark:bg-slate-900 dark:text-primary"
                : "text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "search" && (
        <div className="space-y-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="輸入食品名稱，如：白米飯、雞胸肉"
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button type="submit" className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaryho">
              搜尋
            </button>
          </form>

          {loading && (
            <div className="flex justify-center py-8">
              <LoadingOrb size={32} />
            </div>
          )}

          {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">查詢食品營養成分失敗，請稍後再試。</div>}

          {!loading && !error && samples && (
            <>
              <p className="text-xs text-neutral-500 dark:text-slate-400">「{searchedFor}」共 {total} 筆結果</p>

              {samples.length === 0 ? (
                <p className="py-8 text-center text-neutral-500 dark:text-slate-400">查無符合的食品。</p>
              ) : (
                <div className="divide-y divide-neutral-200 border border-neutral-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                  {samples.map((s) => (
                    <div key={s.sample_id}>
                      <button
                        type="button"
                        onClick={() => toggleSample(s.sample_id)}
                        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-slate-800/60"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-800 dark:text-slate-100">{s.sample_name}</p>
                          <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-neutral-500 dark:text-slate-400">
                            {s.common_name && <span>俗名：{s.common_name}</span>}
                            {s.food_category && <span>分類：{s.food_category}</span>}
                          </div>
                        </div>
                        <span className="shrink-0 text-neutral-400 dark:text-slate-400">{expandedId === s.sample_id ? "收合 ▲" : "展開 ▼"}</span>
                      </button>

                      {expandedId === s.sample_id && (
                        <div className="bg-neutral-50 px-4 py-3 dark:bg-slate-800/40">
                          {itemsLoading && (
                            <div className="flex justify-center py-4">
                              <LoadingOrb size={24} />
                            </div>
                          )}
                          {!itemsLoading && items && items.length === 0 && <p className="text-sm text-neutral-500 dark:text-slate-400">無營養成分資料。</p>}
                          {!itemsLoading && items && items.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="border-b border-neutral-300 text-neutral-500 dark:border-slate-700 dark:text-slate-400">
                                    <th className="py-1.5 pr-3">分析項分類</th>
                                    <th className="py-1.5 pr-3">分析項</th>
                                    <th className="py-1.5 pr-3">每100克含量</th>
                                    <th className="py-1.5">單位</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item, i) => (
                                    <tr key={i} className="border-b border-neutral-200 last:border-0 dark:border-slate-800">
                                      <td className="py-1.5 pr-3 text-neutral-600 dark:text-slate-300">{item.nutrient_category}</td>
                                      <td className="py-1.5 pr-3 font-medium text-neutral-800 dark:text-slate-100">{item.nutrient_item}</td>
                                      <td className="py-1.5 pr-3 text-neutral-800 dark:text-slate-200">{item.value_per_100g ?? "-"}</td>
                                      <td className="py-1.5 text-neutral-500 dark:text-slate-400">{item.unit ?? "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <Pagination page={page} pageSize={pageSize} totalItems={total} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="筆食品" />
            </>
          )}
        </div>
      )}

      {activeTab === "meal" && <MealAnalysisTab />}
      {activeTab === "rank" && <NutrientRankingTab />}
      {activeTab === "supplements" && <HealthSupplementsTab />}
    </div>
  );
}

