"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";

/** Mirrors lib/server/aqx/datasets.ts — kept as a literal list here so this client component has no server-only import. */
const AQX_DATASET_OPTIONS: { code: string; shape: "wide" | "narrow"; nameZh: string; updateFrequency: string }[] = [
  { code: "aqx_p_15", shape: "wide", nameZh: "空氣品質監測小時值（一般污染物）", updateFrequency: "每日更新" },
  { code: "aqx_p_16", shape: "wide", nameZh: "BTEX 監測小時值", updateFrequency: "每日更新" },
  { code: "aqx_p_17", shape: "wide", nameZh: "非甲烷碳氫化合物（NMHC）監測小時值", updateFrequency: "每日更新" },
  { code: "aqx_p_18", shape: "wide", nameZh: "總碳氫化合物（THC）監測小時值", updateFrequency: "每日更新" },
  { code: "aqx_p_25", shape: "wide", nameZh: "光化測站小時值資料", updateFrequency: "每日更新" },
  { code: "aqx_p_318", shape: "narrow", nameZh: "CO 8 小時平均值", updateFrequency: "每日提供 17 筆" },
  { code: "aqx_p_319", shape: "narrow", nameZh: "PM10 小時值", updateFrequency: "每小時更新" },
  { code: "aqx_p_35", shape: "narrow", nameZh: "空氣品質監測小時值資料（其它測項）", updateFrequency: "每小時更新" },
];

interface AqxWideRow {
  id: number;
  dataset_code: string;
  siteid: string;
  sitename: string;
  itemid: string;
  itemname: string;
  itemengname: string | null;
  itemunit: string | null;
  monitordate: string;
  hourly_values: (number | null)[];
}

interface AqxNarrowRow {
  id: number;
  dataset_code: string;
  siteid: string;
  sitename: string;
  county: string | null;
  itemid: string;
  itemname: string;
  itemengname: string | null;
  itemunit: string | null;
  monitordate: string;
  concentration: number | null;
}

/** Last non-null hourly value plus its hour index, for the wide-shape row summary. */
function latestHourValue(hourlyValues: (number | null)[]): { hour: number; value: number } | null {
  for (let h = hourlyValues.length - 1; h >= 0; h--) {
    const v = hourlyValues[h];
    if (v !== null && v !== undefined) return { hour: h, value: v };
  }
  return null;
}

function WideRowCard({ row }: { row: AqxWideRow }) {
  const [expanded, setExpanded] = useState(false);
  const latest = latestHourValue(row.hourly_values);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-neutral-800 dark:text-slate-100">{row.sitename || row.siteid}</p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
            {row.itemname}
            {row.itemunit ? `（${row.itemunit}）` : ""}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">監測日期：{row.monitordate}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-neutral-800 dark:text-slate-100">
            {latest ? latest.value : "—"}
          </p>
          {latest && (
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              最新時段：{String(latest.hour).padStart(2, "0")}:00
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 text-xs font-medium text-primary hover:underline"
      >
        {expanded ? "收合 24 小時數值 ▲" : "展開 24 小時數值 ▼"}
      </button>

      {expanded && (
        <div className="mt-2 grid grid-cols-4 gap-1.5 border-t border-neutral-100 pt-2 dark:border-slate-800 sm:grid-cols-6">
          {row.hourly_values.map((v, h) => (
            <div key={h} className="rounded bg-neutral-50 p-1.5 text-center dark:bg-slate-800/60">
              <p className="text-[10px] text-neutral-400">{String(h).padStart(2, "0")}:00</p>
              <p className="text-xs font-semibold text-neutral-700 dark:text-slate-300">{v ?? "—"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NarrowRowCard({ row }: { row: AqxNarrowRow }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-neutral-800 dark:text-slate-100">{row.sitename || row.siteid}</p>
          {row.county && <p className="text-xs text-neutral-500 dark:text-slate-400">{row.county}</p>}
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
            {row.itemname}
            {row.itemunit ? `（${row.itemunit}）` : ""}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">測值時間：{row.monitordate}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-neutral-800 dark:text-slate-100">
            {row.concentration ?? "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AqxMonitoringContent() {
  const [datasetCode, setDatasetCode] = useState(AQX_DATASET_OPTIONS[0].code);
  const [searchInput, setSearchInput] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [rows, setRows] = useState<(AqxWideRow | AqxNarrowRow)[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const { page, pageSize, setPage, setPageSize } = usePagination();

  const activeDataset = AQX_DATASET_OPTIONS.find((d) => d.code === datasetCode) ?? AQX_DATASET_OPTIONS[0];

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
          const params = new URLSearchParams({
            dataset: datasetCode,
            page: String(page),
            pageSize: String(pageSize),
          });
          if (searchedFor) params.set("keyword", searchedFor);
          const res = await fetch(`/api/aqx?${params.toString()}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          setRows(data.rows || []);
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
  }, [datasetCode, searchedFor, page, pageSize]);

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
          🧪 空氣品質延伸監測資料（AQX 系列）
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          查詢環境部開放資料平臺 AQX 系列監測小時值，涵蓋一般污染物、BTEX、非甲烷碳氫化合物（NMHC）、總碳氫化合物（THC）、光化測站、CO
          8小時平均值、PM10 小時值與其它測項。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="text-xs font-semibold text-neutral-500 dark:text-slate-400">
          資料集：
          <select
            value={datasetCode}
            onChange={(e) => {
              setDatasetCode(e.target.value);
              setPage(1);
            }}
            className="ml-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {AQX_DATASET_OPTIONS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code.toUpperCase()} — {d.nameZh}
              </option>
            ))}
          </select>
        </label>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          更新頻率：{activeDataset.updateFrequency}
        </span>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入測站名稱或測項名稱"
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
          查詢監測資料失敗，請稍後再試。
        </div>
      )}

      {!loading && !error && rows && (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            {searchedFor ? `「${searchedFor}」共 ${total} 筆結果` : `共 ${total} 筆資料`}
          </p>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">
              查無符合的監測資料，資料可能尚未完成首次同步，請稍後再試。
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {activeDataset.shape === "wide"
                ? rows.map((row) => <WideRowCard key={row.id} row={row as AqxWideRow} />)
                : rows.map((row) => <NarrowRowCard key={row.id} row={row as AqxNarrowRow} />)}
            </div>
          )}

          <Pagination page={page} pageSize={pageSize} totalItems={total} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="筆資料" />
        </>
      )}
    </div>
  );
}
