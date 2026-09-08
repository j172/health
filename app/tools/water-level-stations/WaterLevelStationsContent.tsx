"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";

interface WaterLevelStationItem {
  station_id: string;
  observatory_identifier: string | null;
  check_result: string | null;
  check_desc: string | null;
  volt: number | null;
  water_level: number | null;
  recorded_at: string;
}

const formatDateTime = (value: string): string => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-TW", { hour12: false });
};

export default function WaterLevelStationsContent() {
  const [searchInput, setSearchInput] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [stations, setStations] = useState<WaterLevelStationItem[] | null>(null);
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
          const res = await fetch(`/api/wra-water-level?${params.toString()}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          setStations(data.stations || []);
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
          💧 全台水位站即時水位查詢
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          即時查詢經濟部水利署全台河川與地下水位站監測資料，顯示各測站最新水位（公尺）與資料品質檢核結果。資料來源：經濟部水利署開放資料平臺（水位站監測）。
        </p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
          ⚠️ 來源資料未提供測站中文名稱，測站以代碼標示；每 30 分鐘自動同步一次最新資料。
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入測站代碼（如 1010H006）"
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
          查詢水位站監測資料失敗，請稍後再試。
        </div>
      )}

      {!loading && !error && stations && (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            {searchedFor ? `「${searchedFor}」共 ${total} 筆結果` : `共 ${total} 個測站`}
          </p>

          {stations.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">查無符合的測站。</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-800">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-neutral-50 text-xs font-semibold text-neutral-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">測站代碼</th>
                    <th className="px-4 py-2.5">水位 (m)</th>
                    <th className="px-4 py-2.5">電壓 (V)</th>
                    <th className="px-4 py-2.5">資料檢核</th>
                    <th className="px-4 py-2.5">觀測時間</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                  {stations.map((s) => (
                    <tr key={s.station_id} className="bg-white dark:bg-slate-900">
                      <td className="px-4 py-2.5 font-medium text-neutral-800 dark:text-slate-100">
                        {s.station_id}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-700 dark:text-slate-300">
                        {s.water_level ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-500 dark:text-slate-400">{s.volt ?? "—"}</td>
                      <td className="px-4 py-2.5 text-neutral-500 dark:text-slate-400">
                        {s.check_desc || (s.check_result === "true" ? "正常" : "—")}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-500 dark:text-slate-400">
                        {formatDateTime(s.recorded_at)}
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
            itemLabel="個測站"
          />
        </>
      )}
    </div>
  );
}
