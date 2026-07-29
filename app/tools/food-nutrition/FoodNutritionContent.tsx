"use client";

import { useState } from "react";

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

export default function FoodNutritionContent() {
  const [searchInput, setSearchInput] = useState("");
  const [samples, setSamples] = useState<FoodSample[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<NutritionItem[] | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = searchInput.trim();
    if (!keyword) return;

    setLoading(true);
    setError(false);
    setSearchedFor(keyword);
    setExpandedId(null);
    setItems(null);

    try {
      const res = await fetch(`/api/food-nutrition?keyword=${encodeURIComponent(keyword)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSamples(data.samples);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
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
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">🍎 食品營養成分查詢</h1>
        <p className="text-neutral-600">查詢衛福部食藥署食品營養成分資料庫，搜尋食品名稱以檢視每100克含量的熱量、蛋白質、脂肪、碳水化合物等營養成分。</p>
        <p className="mt-1 text-xs text-neutral-500">⚠️ 資料為實測分析數據，同一品項不同批次可能有所差異，僅供參考。</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入食品名稱，如：白米飯、雞胸肉"
          className="flex-1 rounded-none border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none"
        />
        <button type="submit" className="rounded-none bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaryho">
          搜尋
        </button>
      </form>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && <div className="rounded-none bg-red-50 p-4 text-sm text-red-700">查詢食品營養成分失敗，請稍後再試。</div>}

      {!loading && !error && samples && (
        <>
          <p className="text-xs text-neutral-500">「{searchedFor}」共 {samples.length} 筆結果{samples.length >= 30 && "（僅顯示前30筆，請縮小關鍵字範圍）"}</p>

          {samples.length === 0 ? (
            <p className="py-8 text-center text-neutral-500">查無符合的食品。</p>
          ) : (
            <div className="divide-y divide-neutral-200 border border-neutral-200">
              {samples.map((s) => (
                <div key={s.sample_id}>
                  <button
                    type="button"
                    onClick={() => toggleSample(s.sample_id)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-neutral-50"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-800">{s.sample_name}</p>
                      <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-neutral-500">
                        {s.common_name && <span>俗名：{s.common_name}</span>}
                        {s.food_category && <span>分類：{s.food_category}</span>}
                      </div>
                    </div>
                    <span className="shrink-0 text-neutral-400">{expandedId === s.sample_id ? "收合 ▲" : "展開 ▼"}</span>
                  </button>

                  {expandedId === s.sample_id && (
                    <div className="bg-neutral-50 px-4 py-3">
                      {itemsLoading && (
                        <div className="flex justify-center py-4">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                      )}
                      {!itemsLoading && items && items.length === 0 && <p className="text-sm text-neutral-500">無營養成分資料。</p>}
                      {!itemsLoading && items && items.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-neutral-300 text-neutral-500">
                                <th className="py-1.5 pr-3">分析項分類</th>
                                <th className="py-1.5 pr-3">分析項</th>
                                <th className="py-1.5 pr-3">每100克含量</th>
                                <th className="py-1.5">單位</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((item, i) => (
                                <tr key={i} className="border-b border-neutral-200 last:border-0">
                                  <td className="py-1.5 pr-3 text-neutral-600">{item.nutrient_category}</td>
                                  <td className="py-1.5 pr-3 font-medium text-neutral-800">{item.nutrient_item}</td>
                                  <td className="py-1.5 pr-3 text-neutral-800">{item.value_per_100g ?? "-"}</td>
                                  <td className="py-1.5 text-neutral-500">{item.unit ?? "-"}</td>
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
        </>
      )}
    </div>
  );
}
