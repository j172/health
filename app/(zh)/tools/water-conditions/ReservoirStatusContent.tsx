"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";
import ReservoirWaterTankGauge from "@/components/Tools/ReservoirWaterTankGauge";

interface ReservoirStatusItem {
  reservoir_id: string;
  reservoir_name: string | null;
  river_name: string | null;
  town_name: string | null;
  area_code: string | null;
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

const REGION_OPTIONS = [
  { label: "全部水庫", value: "" },
  { label: "北部 (10)", value: "10" },
  { label: "中部 (20)", value: "20" },
  { label: "南部 (30)", value: "30" },
  { label: "東部 (40)", value: "40" },
  { label: "離島 (50)", value: "50" },
];

const formatDateTime = (value: string): string => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-TW", { hour12: false });
};

export default function ReservoirStatusContent() {
  const [searchInput, setSearchInput] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [reservoirs, setReservoirs] = useState<ReservoirStatusItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const { page, pageSize, setPage, setPageSize } = usePagination();

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      (async () => {
        if (cancelled) return;
        setLoading(true);
        setError(false);
        try {
          const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
          if (searchedFor) params.set("keyword", searchedFor);
          if (selectedRegion) params.set("region", selectedRegion);

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
  }, [searchedFor, selectedRegion, page, pageSize]);

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

  const handleRegionSelect = (regionVal: string) => {
    setSelectedRegion(regionVal);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          🏞️ 全台水庫即時營運狀況查詢
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          即時查詢經濟部水利署全台水庫最新營運狀況，包含官方水庫名稱、所屬水系、水位、有效蓄水量與即時進出流量。
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
            💧 官方水庫代碼表 (dataset/139336) 補充中文名稱
          </span>
          <span className="text-neutral-500 dark:text-slate-400">
            每 30 分鐘自動同步最新觀測數據
          </span>
        </div>
      </div>

      {/* Region filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {REGION_OPTIONS.map((opt) => {
          const isActive = selectedRegion === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleRegionSelect(opt.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-primary text-white shadow-sm"
                  : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入水庫名稱、代碼或河川水系（如：翡翠水庫 / 10205 / 新店溪）"
          className="min-w-[220px] flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
            {searchedFor || selectedRegion
              ? `篩選共 ${total} 筆結果`
              : `共 ${total} 座水庫`}
          </p>

          {reservoirs.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">查無符合的水庫。</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-800 shadow-sm">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-neutral-50 text-xs font-semibold text-neutral-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">水庫名稱 / 代碼</th>
                    <th className="px-4 py-3">即時水情蓄水槽</th>
                    <th className="px-4 py-3">進流量 (CMS)</th>
                    <th className="px-4 py-3">出流量合計 (CMS)</th>
                    <th className="px-4 py-3">集水區降雨 (mm)</th>
                    <th className="px-4 py-3">觀測時間</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                  {reservoirs.map((r) => (
                    <tr key={r.reservoir_id} className="bg-white hover:bg-neutral-50/70 dark:bg-slate-900 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-neutral-900 dark:text-slate-100 text-base">
                              {r.reservoir_name || "未具名水庫"}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {r.reservoir_id}
                            </span>
                          </div>
                          {(r.river_name || r.town_name) && (
                            <span className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
                              {r.river_name ? `${r.river_name}` : ""}
                              {r.town_name ? ` · ${r.town_name}` : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ReservoirWaterTankGauge
                          waterLevel={r.water_level}
                          effectiveCapacity={r.effective_capacity}
                        />
                      </td>
                      <td className="px-4 py-3 text-neutral-600 dark:text-slate-300 font-mono">
                        {r.inflow_discharge !== null ? r.inflow_discharge.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3 text-neutral-600 dark:text-slate-300 font-mono">
                        {r.total_outflow !== null ? r.total_outflow.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3 text-neutral-600 dark:text-slate-300 font-mono">
                        {r.accumulate_rainfall !== null ? `${r.accumulate_rainfall.toFixed(1)} mm` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500 dark:text-slate-400 whitespace-nowrap">
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
