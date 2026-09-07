"use client";

import { useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";

interface FoodSample {
  sample_id: string;
  sample_name: string | null;
  common_name: string | null;
  sample_name_en: string | null;
  food_category: string | null;
}

interface MealRow {
  id: number;
  keyword: string;
  results: FoodSample[];
  searching: boolean;
  selected: FoodSample | null;
  grams: string;
}

interface MealNutrientAmount {
  nutrient_category: string;
  nutrient_item: string;
  unit: string | null;
  value: number | null;
}

interface MealFoodBreakdown {
  sample_id: string;
  sample_name: string | null;
  grams: number;
  items: MealNutrientAmount[];
}

interface MealNutrientTotal {
  nutrient_category: string;
  nutrient_item: string;
  unit: string | null;
  total_value: number;
}

interface MealAnalysisResult {
  foods: MealFoodBreakdown[];
  totals: MealNutrientTotal[];
}

let nextRowId = 1;
const createRow = (): MealRow => ({ id: nextRowId++, keyword: "", results: [], searching: false, selected: null, grams: "100" });

export default function MealAnalysisTab() {
  const [rows, setRows] = useState<MealRow[]>([createRow()]);
  const [expandedFood, setExpandedFood] = useState<string | null>(null);
  const [result, setResult] = useState<MealAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(false);

  const updateRow = (id: number, patch: Partial<MealRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const searchRow = async (id: number) => {
    const row = rows.find((r) => r.id === id);
    const keyword = row?.keyword.trim();
    if (!keyword) return;

    updateRow(id, { searching: true });
    try {
      const res = await fetch(`/api/food-nutrition?keyword=${encodeURIComponent(keyword)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      updateRow(id, { results: data.samples ?? [] });
    } catch {
      updateRow(id, { results: [] });
    } finally {
      updateRow(id, { searching: false });
    }
  };

  const selectSample = (id: number, sample: FoodSample) => {
    updateRow(id, { selected: sample, results: [], keyword: sample.sample_name ?? "" });
  };

  const removeRow = (id: number) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  };

  const handleAnalyze = async () => {
    const items = rows
      .filter((row) => row.selected && Number(row.grams) > 0)
      .map((row) => ({ sampleId: row.selected!.sample_id, grams: Number(row.grams) }));

    if (items.length === 0) return;

    setAnalyzing(true);
    setError(false);
    setExpandedFood(null);
    try {
      const res = await fetch("/api/food-nutrition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch {
      setError(true);
      setResult(null);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-neutral-800 dark:text-slate-100">🍱 餐點總營養分析</h2>
        <p className="text-sm text-neutral-600 dark:text-slate-300">加入餐點中的每項食物與重量（克），計算整份餐點的總熱量與各項營養素含量。</p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={row.keyword}
                onChange={(e) => updateRow(row.id, { keyword: e.target.value, selected: null })}
                placeholder="輸入食品名稱，如：白米飯"
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => searchRow(row.id)}
                className="shrink-0 rounded-lg bg-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-300 dark:bg-slate-700 dark:text-slate-200"
              >
                搜尋
              </button>
              <input
                type="number"
                min={1}
                value={row.grams}
                onChange={(e) => updateRow(row.id, { grams: e.target.value })}
                placeholder="克數"
                className="w-24 shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="shrink-0 text-xs text-neutral-500 dark:text-slate-400">克</span>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="shrink-0 rounded-lg px-2 py-2 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  移除
                </button>
              )}
            </div>

            {row.searching && (
              <div className="flex justify-center py-3">
                <LoadingOrb size={20} />
              </div>
            )}

            {!row.searching && row.results.length > 0 && (
              <div className="mt-2 max-h-40 divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200 dark:divide-slate-800 dark:border-slate-800">
                {row.results.map((sample) => (
                  <button
                    key={sample.sample_id}
                    type="button"
                    onClick={() => selectSample(row.id, sample)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-slate-800/60"
                  >
                    {sample.sample_name}
                    {sample.food_category && <span className="ml-2 text-xs text-neutral-500 dark:text-slate-400">{sample.food_category}</span>}
                  </button>
                ))}
              </div>
            )}

            {row.selected && (
              <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">已選擇：{row.selected.sample_name}</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, createRow()])}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          + 加入食物
        </button>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={analyzing || !rows.some((row) => row.selected)}
          className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-primaryho disabled:cursor-not-allowed disabled:opacity-50"
        >
          分析
        </button>
      </div>

      {analyzing && (
        <div className="flex justify-center py-8">
          <LoadingOrb size={32} />
        </div>
      )}

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">分析餐點營養成分失敗，請稍後再試。</div>}

      {!analyzing && result && (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-bold text-neutral-800 dark:text-slate-100">整份餐點總營養</h3>
            <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-slate-800">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-300 bg-neutral-50 text-neutral-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                    <th className="px-3 py-2">分析項分類</th>
                    <th className="px-3 py-2">分析項</th>
                    <th className="px-3 py-2">總含量</th>
                    <th className="px-3 py-2">單位</th>
                  </tr>
                </thead>
                <tbody>
                  {result.totals.map((total, i) => (
                    <tr key={i} className="border-b border-neutral-200 last:border-0 dark:border-slate-800">
                      <td className="px-3 py-2 text-neutral-600 dark:text-slate-300">{total.nutrient_category}</td>
                      <td className="px-3 py-2 font-medium text-neutral-800 dark:text-slate-100">{total.nutrient_item}</td>
                      <td className="px-3 py-2 text-neutral-800 dark:text-slate-200">{total.total_value.toFixed(2)}</td>
                      <td className="px-3 py-2 text-neutral-500 dark:text-slate-400">{total.unit ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-neutral-800 dark:text-slate-100">各食物明細</h3>
            <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {result.foods.map((food) => (
                <div key={food.sample_id}>
                  <button
                    type="button"
                    onClick={() => setExpandedFood(expandedFood === food.sample_id ? null : food.sample_id)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-slate-800/60"
                  >
                    <span className="font-semibold text-neutral-800 dark:text-slate-100">{food.sample_name}（{food.grams} 克）</span>
                    <span className="shrink-0 text-neutral-400 dark:text-slate-400">{expandedFood === food.sample_id ? "收合 ▲" : "展開 ▼"}</span>
                  </button>
                  {expandedFood === food.sample_id && (
                    <div className="overflow-x-auto bg-neutral-50 px-4 py-3 dark:bg-slate-800/40">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-neutral-300 text-neutral-500 dark:border-slate-700 dark:text-slate-400">
                            <th className="py-1.5 pr-3">分析項</th>
                            <th className="py-1.5 pr-3">含量</th>
                            <th className="py-1.5">單位</th>
                          </tr>
                        </thead>
                        <tbody>
                          {food.items.map((item, i) => (
                            <tr key={i} className="border-b border-neutral-200 last:border-0 dark:border-slate-800">
                              <td className="py-1.5 pr-3 font-medium text-neutral-800 dark:text-slate-100">{item.nutrient_item}</td>
                              <td className="py-1.5 pr-3 text-neutral-800 dark:text-slate-200">{item.value === null ? "無數據" : item.value.toFixed(2)}</td>
                              <td className="py-1.5 text-neutral-500 dark:text-slate-400">{item.unit ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
