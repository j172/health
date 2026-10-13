"use client";

import { useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";

interface FoodOperator {
  id: number;
  registration_no: string;
  company_name: string | null;
  unified_business_no: string | null;
  address: string | null;
  registration_type: string | null;
}

export default function FoodOperatorsContent() {
  const [searchInput, setSearchInput] = useState("");
  const [operators, setOperators] = useState<FoodOperator[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = searchInput.trim();
    if (!keyword) return;

    setLoading(true);
    setError(false);
    setSearchedFor(keyword);

    try {
      const res = await fetch(`/api/food-operators?keyword=${encodeURIComponent(keyword)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOperators(data.operators);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">🏭 食品業者登錄查詢</h1>
        <p className="text-neutral-600 dark:text-slate-300">查詢衛福部食藥署食品業者登錄資料，依公司名稱、統一編號或地址搜尋業者的登錄字號與登錄項目。</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">⚠️ 本資料庫僅反映業者登錄狀態，不代表產品安全或衛生檢驗結果。</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入公司名稱、統一編號或地址關鍵字"
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

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">查詢食品業者資料失敗，請稍後再試。</div>}

      {!loading && !error && operators && (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            「{searchedFor}」共 {operators.length} 筆結果{operators.length >= 50 && "（僅顯示前50筆，請縮小關鍵字範圍）"}
          </p>

          {operators.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">查無符合的食品業者。</p>
          ) : (
            <div className="divide-y divide-neutral-200 border border-neutral-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {operators.map((o) => (
                <div key={o.id} className="px-4 py-3">
                  <p className="font-semibold text-neutral-800 dark:text-slate-100">{o.company_name ?? "（未提供名稱）"}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-slate-400">
                    <span>登錄字號：{o.registration_no}</span>
                    {o.unified_business_no && <span>統一編號：{o.unified_business_no}</span>}
                    {o.registration_type && <span>登錄項目：{o.registration_type}</span>}
                  </div>
                  {o.address && <p className="mt-1 text-xs text-neutral-600 dark:text-slate-300">{o.address}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
