"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";

interface CoefficientItem {
  id: number;
  coefficient_name: string;
  coefficient_value: number | null;
  unit: string | null;
  department_name: string;
  announcement_year: string;
}

export default function CarbonFootprintCoefficientsContent() {
  const [searchInput, setSearchInput] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [coefficients, setCoefficients] = useState<CoefficientItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const { page, pageSize, setPage, setPageSize } = usePagination();

  useEffect(() => {
    let cancelled = false;

    // Deferred via queueMicrotask (see e4800b1 / issue #121): calling setState
    // synchronously in an effect body trips react-hooks/set-state-in-effect.
    queueMicrotask(() => {
      (async () => {
        if (cancelled) return;
        setLoading(true);
        setError(false);
        try {
          const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
          if (searchedFor) params.set("keyword", searchedFor);
          const res = await fetch(`/api/carbon-footprint-coefficients?${params.toString()}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          setCoefficients(data.coefficients || []);
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
    setSearchedFor(searchInput.trim());
    setPage(1);
  };

  const handleClear = () => {
    setSearchInput("");
    setSearchedFor("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          📐 碳足跡排放係數查詢
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          查詢環境部公告之碳足跡排放係數（如原物料、製程、能源等單位活動量的溫室氣體排放量），供產品碳足跡計算使用。資料來源：環境部開放資料（cfp_p_02）。
        </p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
          ⚠️ 公司/部門名稱欄位由各申報單位選擇性揭露，部分係數可能未標示來源部門。
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入係數名稱或公告部門"
          className="min-w-[180px] flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaryho"
        >
          搜尋
        </button>
        {searchedFor && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            清除
          </button>
        )}
      </form>

      {loading && (
        <div className="flex justify-center py-8">
          <LoadingOrb size={32} />
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          查詢碳足跡排放係數資料失敗，請稍後再試。
        </div>
      )}

      {!loading && !error && coefficients && (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            {searchedFor ? `「${searchedFor}」共 ${total} 筆結果` : `共 ${total} 筆係數資料`}
          </p>

          {coefficients.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">查無符合的排放係數。</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-800">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-neutral-50 text-xs font-semibold text-neutral-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">係數名稱</th>
                    <th className="px-4 py-2.5">數值</th>
                    <th className="px-4 py-2.5">單位</th>
                    <th className="px-4 py-2.5">公告部門</th>
                    <th className="px-4 py-2.5">公告年份</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                  {coefficients.map((c) => (
                    <tr key={c.id} className="bg-white dark:bg-slate-900">
                      <td className="px-4 py-2.5 font-medium text-neutral-800 dark:text-slate-100">
                        {c.coefficient_name}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-700 dark:text-slate-300">
                        {c.coefficient_value ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-500 dark:text-slate-400">{c.unit || "—"}</td>
                      <td className="px-4 py-2.5 text-neutral-500 dark:text-slate-400">
                        {c.department_name || "未揭露"}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-500 dark:text-slate-400">
                        {c.announcement_year || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination page={page} pageSize={pageSize} totalItems={total} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="筆係數" />
        </>
      )}
    </div>
  );
}
