"use client";

import { useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";

interface HealthSupplementSummary {
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

export default function HealthSupplementsTab() {
  const [keyword, setKeyword] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [results, setResults] = useState<HealthSupplementSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyword.trim();

    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (trimmed) params.set("keyword", trimmed);
      params.set("activeOnly", String(activeOnly));
      const res = await fetch(`/api/health-supplements?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setError(true);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-neutral-800 dark:text-slate-100">✅ 健康食品(健字號)搜尋</h2>
        <p className="text-sm text-neutral-600 dark:text-slate-300">查詢衛福部食藥署核可之「健康食品」（健字號），依名稱或保健功效關鍵字搜尋。</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
          ⚠️ 健康食品(健字號)是食藥署認證的特定法定分類，與一般市售保健食品不同；本工具僅提供公開資料查詢，非購買或醫療建議。
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="輸入品名或保健功效關鍵字，如：護肝、益生菌"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-neutral-600 dark:text-slate-300">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="h-4 w-4 accent-primary" />
          僅顯示有效證號
        </label>
        <button type="submit" className="shrink-0 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaryho">
          搜尋
        </button>
      </form>

      {loading && (
        <div className="flex justify-center py-8">
          <LoadingOrb size={32} />
        </div>
      )}

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">查詢健康食品資料失敗，請稍後再試。</div>}

      {!loading && !error && results && (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">共 {results.length} 筆結果</p>
          {results.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">查無符合的健康食品。</p>
          ) : (
            <div className="space-y-3">
              {results.map((item) => (
                <div key={item.license_no} className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-neutral-800 dark:text-slate-100">{item.name_zh}</p>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
                        許可證字號：{item.license_no}
                        {item.category && ` ・ 類別：${item.category}`}
                        {item.approved_at && ` ・ 核可日期：${item.approved_at}`}
                      </p>
                    </div>
                    {item.status && (
                      <span
                        className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${
                          item.status === "核可"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                            : "bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {item.status}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 space-y-1 text-sm text-neutral-700 dark:text-slate-300">
                    {item.applicant && <p>申請商：{item.applicant}</p>}
                    {item.function_text && <p>保健功效：{item.function_text}</p>}
                    {item.function_ingredients && <p>保健功效相關成分：{item.function_ingredients}</p>}
                    {item.claim && <p>保健功效宣稱：{item.claim}</p>}
                    {item.warning && <p className="text-amber-700 dark:text-amber-400">警語：{item.warning}</p>}
                    {item.notice && <p className="text-amber-700 dark:text-amber-400">注意事項：{item.notice}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
