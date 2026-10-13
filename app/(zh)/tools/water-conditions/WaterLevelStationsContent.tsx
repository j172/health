"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";
import WaterLevelStaffGauge from "@/components/Tools/WaterLevelStaffGauge";

interface WaterLevelStationItem {
  station_id: string;
  station_name: string | null;
  river_name: string | null;
  location_address: string | null;
  alert_level_1: number | null;
  alert_level_2: number | null;
  alert_level_3: number | null;
  observatory_identifier: string | null;
  check_result: string | null;
  check_desc: string | null;
  volt: number | null;
  water_level: number | null;
  recorded_at: string;
}

const REGION_OPTIONS = [
  { label: "全部測站", value: "" },
  { label: "北部", value: "北部" },
  { label: "中部", value: "中部" },
  { label: "南部", value: "南部" },
  { label: "東部", value: "東部" },
  { label: "離島", value: "離島" },
];

const formatDateTime = (value: string): string => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-TW", { hour12: false });
};

export default function WaterLevelStationsContent() {
  const [searchInput, setSearchInput] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [stations, setStations] = useState<WaterLevelStationItem[] | null>(null);
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
          💧 全台水位站即時水位查詢
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          即時查詢經濟部水利署全台河川與地下水位站監測資料，顯示官方測站名稱、所屬水系流域、即時水位（公尺）與防汛警戒標尺。
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
            🌊 官方水位測站站況 (dataset/22227) 補充中文名稱與警戒水位
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
          placeholder="輸入測站名稱、代碼、河川或地區（如：新磺溪橋 / 1010H006 / 磺溪 / 金山）"
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
          查詢水位站監測資料失敗，請稍後再試。
        </div>
      )}

      {!loading && !error && stations && (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            {searchedFor || selectedRegion
              ? `篩選共 ${total} 筆結果`
              : `共 ${total} 個測站`}
          </p>

          {stations.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">查無符合的測站。</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-800 shadow-sm">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-neutral-50 text-xs font-semibold text-neutral-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">測站名稱 / 代碼</th>
                    <th className="px-4 py-3">即時水位與防汛標尺規</th>
                    <th className="px-4 py-3">電壓 (V)</th>
                    <th className="px-4 py-3">資料檢核</th>
                    <th className="px-4 py-3">觀測時間</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                  {stations.map((s) => (
                    <tr key={s.station_id} className="bg-white hover:bg-neutral-50/70 dark:bg-slate-900 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-neutral-900 dark:text-slate-100 text-base">
                              {s.station_name || "未具名測站"}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {s.station_id}
                            </span>
                          </div>
                          {(s.river_name || s.location_address) && (
                            <span className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
                              {s.river_name ? `${s.river_name}` : ""}
                              {s.location_address ? ` · ${s.location_address}` : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <WaterLevelStaffGauge
                          waterLevel={s.water_level}
                          alertLevel1={s.alert_level_1}
                          alertLevel2={s.alert_level_2}
                          alertLevel3={s.alert_level_3}
                        />
                      </td>
                      <td className="px-4 py-3 text-neutral-500 dark:text-slate-400 font-mono">
                        {s.volt !== null ? `${s.volt.toFixed(1)} V` : "—"}
                      </td>
                      <td className="px-4 py-3 text-neutral-600 dark:text-slate-400 text-xs">
                        <span className={`inline-block rounded px-1.5 py-0.5 ${
                          s.check_desc || s.check_result !== "true"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}>
                          {s.check_desc || (s.check_result === "true" ? "正常" : "異常/未檢核")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500 dark:text-slate-400 whitespace-nowrap">
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
