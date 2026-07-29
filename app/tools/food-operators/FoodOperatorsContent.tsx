"use client";

import { useState } from "react";

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
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">🏭 食品業者登錄查詢</h1>
        <p className="text-neutral-600">查詢衛福部食藥署食品業者登錄資料，依公司名稱、統一編號或地址搜尋業者的登錄字號與登錄項目。</p>
        <p className="mt-1 text-xs text-neutral-500">⚠️ 本資料庫僅反映業者登錄狀態，不代表產品安全或衛生檢驗結果。</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入公司名稱、統一編號或地址關鍵字"
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

      {error && <div className="rounded-none bg-red-50 p-4 text-sm text-red-700">查詢食品業者資料失敗，請稍後再試。</div>}

      {!loading && !error && operators && (
        <>
          <p className="text-xs text-neutral-500">
            「{searchedFor}」共 {operators.length} 筆結果{operators.length >= 50 && "（僅顯示前50筆，請縮小關鍵字範圍）"}
          </p>

          {operators.length === 0 ? (
            <p className="py-8 text-center text-neutral-500">查無符合的食品業者。</p>
          ) : (
            <div className="divide-y divide-neutral-200 border border-neutral-200">
              {operators.map((o) => (
                <div key={o.id} className="px-4 py-3">
                  <p className="font-semibold text-neutral-800">{o.company_name ?? "（未提供名稱）"}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                    <span>登錄字號：{o.registration_no}</span>
                    {o.unified_business_no && <span>統一編號：{o.unified_business_no}</span>}
                    {o.registration_type && <span>登錄項目：{o.registration_type}</span>}
                  </div>
                  {o.address && <p className="mt-1 text-xs text-neutral-600">{o.address}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
