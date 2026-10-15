"use client";

import { useEffect, useState, type FormEvent } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { usePagination } from "@/lib/hooks/usePagination";
import { TAIWAN_COUNTIES } from "@/lib/constants/taiwanDistricts";
import { getRouteCityForCounty, NO_ROUTE_DATA_MESSAGE } from "@/lib/tools/garbageTrucks/coverage";
import { formatClock, formatWeekdays } from "@/lib/tools/garbageTrucks/schedule";
import type { GarbageRouteStopRow } from "@/lib/server/garbageRoutes/queries";

interface RoutesResponse {
  ok: boolean;
  total: number;
  stops: GarbageRouteStopRow[];
  districts: string[];
  syncedAt: string | null;
}

const selectClass =
  "rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 shadow-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

const formatSyncDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
};

/**
 * 路線與收運時間 tab of the 垃圾車與清潔隊 page (issue #674 / B-16): scheduled
 * stops of the garbage trucks of the cities that publish route data. A county
 * without data never calls the API — it gets the plain statement
 * 「尚無路線資料，請洽清潔隊」 and a button into the 清潔隊 contact tab
 * (`onFindSquad`).
 *
 * Structure note for later tickets (#679's live-location layer): this tab only
 * owns the scheduled-stop list. Anything live is a separate layer/tab beside
 * it, fed by its own route, so nothing here needs to change.
 */
export default function GarbageRoutesTab({ onFindSquad }: { onFindSquad: (county: string) => void }) {
  const [county, setCounty] = useState<string>("臺北市");
  const [district, setDistrict] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [data, setData] = useState<RoutesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Separate query-string names so this tab's paging never leaks into the
  // 清潔隊 tab's own (default-named) pagination when the visitor switches tabs.
  const { page, pageSize, offset, setPage, setPageSize } = usePagination({
    pageParam: "routePage",
    pageSizeParam: "routePageSize",
  });

  const routeCity = getRouteCityForCounty(county);

  useEffect(() => {
    if (!routeCity) return;
    let cancelled = false;

    const params = new URLSearchParams({ city: routeCity, limit: String(pageSize), offset: String(offset) });
    if (district) params.set("district", district);
    if (keyword) params.set("keyword", keyword);

    (async () => {
      try {
        setLoading(true);
        const res = await fetchWithTimeout(`/api/garbage-routes?${params.toString()}`, { timeoutMs: 8000 });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: RoutesResponse = await res.json();
        if (!cancelled) {
          setData(json);
          setError(false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeCity, district, keyword, pageSize, offset]);

  const handleCountyChange = (next: string) => {
    setCounty(next);
    setDistrict("");
    setData(null);
    setLoading(true);
    setPage(1);
  };

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setKeyword(searchInput.trim());
    setPage(1);
  };

  const noFiltersApplied = !district && !keyword;
  const syncDate = formatSyncDate(data?.syncedAt ?? null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-neutral-800 dark:text-slate-100">🚛 路線與收運時間</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-slate-300">
          選擇縣市後，可依行政區或關鍵字（路名、里別、路線名稱）查詢垃圾車的表定停靠點與時間。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="garbage-route-county">
          選擇縣市
        </label>
        <select
          id="garbage-route-county"
          value={county}
          onChange={(event) => handleCountyChange(event.target.value)}
          className={selectClass}
        >
          {TAIWAN_COUNTIES.map((name) => (
            <option key={name} value={name}>
              {name}
              {getRouteCityForCounty(name) ? "" : "（尚無路線資料）"}
            </option>
          ))}
        </select>

        {routeCity && (
          <>
            <label className="sr-only" htmlFor="garbage-route-district">
              選擇行政區
            </label>
            <select
              id="garbage-route-district"
              value={district}
              onChange={(event) => {
                setDistrict(event.target.value);
                setPage(1);
              }}
              className={selectClass}
            >
              <option value="">全部行政區</option>
              {(data?.districts ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {!routeCity ? (
        <div
          role="status"
          className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          <p className="text-base font-bold text-neutral-800 dark:text-slate-100">{NO_ROUTE_DATA_MESSAGE}</p>
          <p className="mt-1">
            {county}目前沒有可查詢的垃圾車路線資料。垃圾車的收運地點與時間，請直接洽詢{county}當地的清潔隊。
          </p>
          <button
            type="button"
            onClick={() => onFindSquad(county)}
            className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 dark:bg-indigo-500"
          >
            查詢{county}清潔隊電話與地址
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="輸入路名、里別或路線名稱"
              aria-label="搜尋垃圾車停靠點"
              maxLength={60}
              className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 dark:bg-indigo-500"
            >
              搜尋
            </button>
          </form>

          {routeCity === "taipei" && (
            <p className="rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
              臺北市的公開資料只提供每個停靠點的到站與離開時間，沒有收運星期；實際收運日請依各里公告為準。
            </p>
          )}

          {loading && !data ? (
            <div className="flex items-center justify-center gap-3 py-10 text-sm text-neutral-500 dark:text-slate-400">
              <LoadingOrb size={28} />
              <span>查詢中…</span>
            </div>
          ) : error ? (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-300">
              查詢垃圾車路線失敗，請稍後再試。
            </p>
          ) : data && data.total === 0 ? (
            <p role="status" className="rounded-xl bg-neutral-100 p-4 text-sm text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
              {noFiltersApplied && !data.syncedAt
                ? `${county}的路線資料正在準備中（資料每日同步一次），請稍後再試或洽當地清潔隊。`
                : "查無符合的停靠點，請換個關鍵字或選擇其他行政區。"}
            </p>
          ) : data ? (
            <>
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                共 {data.total.toLocaleString("zh-TW")} 個停靠點
                {syncDate ? `，資料最近同步日期：${syncDate}` : ""}
              </p>
              <StopList stops={data.stops} />
              <Pagination
                page={page}
                pageSize={pageSize}
                totalItems={data.total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="個停靠點"
              />
            </>
          ) : null}
        </>
      )}

      <SourceNote />
    </div>
  );
}

function DayLine({ label, mask }: { label: string; mask: number | null }) {
  const text = formatWeekdays(mask);
  if (text === null) return null;
  return (
    <span className="mr-3 inline-block">
      <span className="text-neutral-500 dark:text-slate-400">{label}：</span>
      {text}
    </span>
  );
}

function StopList({ stops }: { stops: GarbageRouteStopRow[] }) {
  // Stops arrive ordered by line then stop order, so a header row is needed
  // whenever the line changes from one stop to the next.
  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
      {stops.map((stop, index) => {
        const showHeader = index === 0 || stops[index - 1].lineId !== stop.lineId;
        const time =
          stop.arriveTime && stop.departTime
            ? `${formatClock(stop.arriveTime)}–${formatClock(stop.departTime)}`
            : formatClock(stop.arriveTime);
        return (
          <li key={stop.id}>
            {showHeader && (
              <div className="bg-neutral-50 px-4 py-2 text-xs font-bold text-neutral-700 dark:bg-slate-800/60 dark:text-slate-200">
                {stop.district} · {stop.lineName}
                {stop.tripLabel ? `（${stop.tripLabel}）` : ""}
                {stop.team ? ` · ${stop.team}` : ""}
              </div>
            )}
            <div className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-neutral-800 dark:text-slate-100">{stop.stopName}</span>
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{time}</span>
              </div>
              {stop.village && <div className="text-xs text-neutral-500 dark:text-slate-400">{stop.village}</div>}
              {(stop.garbageDays !== null || stop.recyclingDays !== null || stop.foodscrapsDays !== null) && (
                <div className="mt-1 text-xs text-neutral-700 dark:text-slate-300">
                  <DayLine label="一般垃圾" mask={stop.garbageDays} />
                  <DayLine label="資源回收" mask={stop.recyclingDays} />
                  <DayLine label="廚餘" mask={stop.foodscrapsDays} />
                </div>
              )}
              {stop.memo && <div className="mt-1 text-xs text-neutral-500 dark:text-slate-400">備註：{stop.memo}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SourceNote() {
  return (
    <p className="text-xs leading-relaxed text-neutral-500 dark:text-slate-400">
      資料來源：臺北市政府資料大平臺「臺北市垃圾車點位路線資訊」（
      <a
        href={appendOutboundUtm("https://data.gov.tw/dataset/136515", { medium: "data_source", campaign: "cleaning_squads_tool" })}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        data.gov.tw 136515
      </a>
      ）、新北市政府資料開放平臺「新北市垃圾車路線」（
      <a
        href={appendOutboundUtm("https://data.gov.tw/dataset/125664", { medium: "data_source", campaign: "cleaning_squads_tool" })}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        data.gov.tw 125664
      </a>
      ），依政府資料開放授權條款－第1版提供（data.gov.tw 目錄標示）。本頁依各市公開資料呈現表定路線與時間，非本站判定；實際到站時間可能因交通、天候或路線調整而不同，請以各區清潔隊公告為準。資料每日同步一次。
    </p>
  );
}
