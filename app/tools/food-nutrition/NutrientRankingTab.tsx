"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";

interface FoodNutrientRankRow {
  sample_id: string;
  sample_name: string | null;
  value_per_100g: string | null;
}

export default function NutrientRankingTab() {
  const [nutrients, setNutrients] = useState<string[]>([]);
  const [nutrientsLoading, setNutrientsLoading] = useState(true);
  const [selectedNutrient, setSelectedNutrient] = useState("");
  const [limit, setLimit] = useState(20);
  const [rows, setRows] = useState<FoodNutrientRankRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/food-nutrition?mode=nutrients")
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        const list: string[] = data.nutrients ?? [];
        setNutrients(list);
        if (list.length > 0) setSelectedNutrient(list[0]);
      })
      .catch(() => {
        if (isMounted) setNutrients([]);
      })
      .finally(() => {
        if (isMounted) setNutrientsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNutrient) return;

    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/food-nutrition?mode=rank&nutrient=${encodeURIComponent(selectedNutrient)}&limit=${limit}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch {
      setError(true);
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-neutral-800 dark:text-slate-100">📊 依營養素排行食物</h2>
        <p className="text-sm text-neutral-600 dark:text-slate-300">選擇一項營養素，依每100克含量由高到低排列常見食品。</p>
      </div>

      {nutrientsLoading ? (
        <div className="flex justify-center py-8">
          <LoadingOrb size={32} />
        </div>
      ) : (
        <form onSubmit={handleRank} className="flex flex-wrap items-center gap-2">
          <select
            value={selectedNutrient}
            onChange={(e) => setSelectedNutrient(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {nutrients.map((nutrient) => (
              <option key={nutrient} value={nutrient}>
                {nutrient}
              </option>
            ))}
          </select>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                前 {n} 名
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaryho">
            查詢排行
          </button>
        </form>
      )}

      {loading && (
        <div className="flex justify-center py-8">
          <LoadingOrb size={32} />
        </div>
      )}

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">查詢營養素排行失敗，請稍後再試。</div>}

      {!loading && !error && rows && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-slate-800">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-neutral-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                <th className="px-3 py-2">排名</th>
                <th className="px-3 py-2">食品名稱</th>
                <th className="px-3 py-2">每100克含量</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-neutral-500 dark:text-slate-400">
                    查無資料。
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row.sample_id} className="border-b border-neutral-200 last:border-0 dark:border-slate-800">
                    <td className="px-3 py-2 text-neutral-500 dark:text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-neutral-800 dark:text-slate-100">{row.sample_name}</td>
                    <td className="px-3 py-2 text-neutral-800 dark:text-slate-200">{row.value_per_100g}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
