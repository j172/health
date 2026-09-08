"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";

interface ReservoirStatusItem {
  reservoir_id: string;
  observation_time: string;
  water_level: number | null;
  effective_capacity: number | null;
  inflow_discharge: number | null;
  total_outflow: number | null;
  spillway_outflow: number | null;
  power_outlet_outflow: number | null;
  drainage_tunnel_outflow: number | null;
  desilting_tunnel_outflow: number | null;
  others_outflow: number | null;
  water_draw: number | null;
  accumulate_rainfall: number | null;
  predetermined_cross_flow: number | null;
  predetermined_outflow_time: string | null;
  status_type: string | null;
}

const formatDateTime = (value: string): string => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-TW", { hour12: false });
};

export default function ReservoirStatusContent() {
  const [searchInput, setSearchInput] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [reservoirs, setReservoirs] = useState<ReservoirStatusItem[] | null>(null);
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
          const res = await fetch(`/api/wra-reservoir-status?${params.toString()}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          setReservoirs(data.reservoirs || []);
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
          🏞️ 全台水庫即時營運狀況查詢
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          即時查詢經濟部水利署全台水庫最新營運狀況，包含水位、有效蓄水量、進出流量與集水區降雨量。資料來源：經濟部水利署開放資料平臺（水庫即時營運狀況）。
        </p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
          ⚠️ 來源資料未提供水庫中文名稱，水庫以代碼標示（前兩碼為區域：10北部/20中部/30南部/40東部/50離島）；每 30 分鐘自動同步一次最新資料。
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入水庫代碼（如 50303）"
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
          查詢水庫即時營運狀況資料失敗，請稍後再試。
        </div>
      )}

      {!loading && !error && reservoirs && (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            {searchedFor ? `「${searchedFor}」共 ${total} 筆結果` : `共 ${total} 座水庫`}
          </p>

          {reservoirs.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">查無符合的水庫。</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-800">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-neutral-50 text-xs font-semibold text-neutral-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">水庫代碼</th>
                    <th className="px-4 py-2.5">水位 (m)</th>
                    <th className="px-4 py-2.5">有效蓄水量 (萬m³)</th>
                    <th className="px-4 py-2.5">進流量 (CMS)</th>
                    <th className="px-4 py-2.5">出流量合計 (CMS)</th>
                    <th className="px-4 py-2.5">集水區累積雨量 (mm)</th>
                    <th className="px-4 py-2.5">觀測時間</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                  {reservoirs.map((r) => (
                    <tr key={r.reservoir_id} className="bg-white dark:bg-slate-900">
                      <td className="px-4 py-2.5 font-medium text-neutral-800 dark:text-slate-100">
                        {r.reservoir_id}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-700 dark:text-slate-300">
                        {r.water_level ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-700 dark:text-slate-300">
                        {r.effective_capacity ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-500 dark:text-slate-400">
                        {r.inflow_discharge ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-500 dark:text-slate-400">
                        {r.total_outflow ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-500 dark:text-slate-400">
                        {r.accumulate_rainfall ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-500 dark:text-slate-400">
                        {formatDateTime(r.observation_time)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={page}
            pageSize={pageSize}
            totalItems={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="座水庫"
          />
        </>
      )}
    </div>
  );
}
