"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CwaAlertItem,
  NearestRainfallOverview,
  TopRainfallStation,
} from "@/lib/server/cwa/queries";
import { useSharedGeolocation } from "@/lib/hooks/useSharedGeolocation";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { useLanguage } from "@/app/context/LanguageContext";

const TAIWAN_COUNTIES = [
  "臺北市",
  "新北市",
  "基隆市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "臺中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "臺南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "臺東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
];

/**
 * `locationName` stores either a real (government-data) county name —
 * kept in Chinese verbatim, per issue #485 — or this sentinel when the
 * "current GPS position" label applies instead of a county name. The
 * sentinel is resolved to a translated label via t() at render time
 * rather than baking translated text into state, so it reflects the
 * active locale even after a language switch.
 */
const CURRENT_LOCATION_SENTINEL = "__current_location__";

const formatRainValue = (val: string | number | null | undefined): string => {
  if (val == null || val === "" || val === "-99" || val === "-999") return "0.0";
  const num = typeof val === "number" ? val : parseFloat(String(val));
  return isNaN(num) || num < 0 ? "0.0" : num.toFixed(1);
};

type Translator = (key: string, defaultValue?: string) => string;

const getRainIntensityBadge = (t: Translator, mm24: number, mm1: number) => {
  if (mm24 >= 500) {
    return {
      label: t("weatherAlertsTool.rainIntensityExtreme", "超大豪雨"),
      bg: "bg-purple-600 text-white",
      border: "border-purple-300 dark:border-purple-800",
    };
  }
  if (mm24 >= 350 || mm1 >= 200) {
    return {
      label: t("weatherAlertsTool.rainIntensityVeryHeavy", "大豪雨"),
      bg: "bg-red-600 text-white",
      border: "border-red-300 dark:border-red-800",
    };
  }
  if (mm24 >= 200 || mm1 >= 100) {
    return {
      label: t("weatherAlertsTool.rainIntensityHeavy", "豪雨"),
      bg: "bg-orange-500 text-white",
      border: "border-orange-300 dark:border-orange-800",
    };
  }
  if (mm24 >= 80 || mm1 >= 40) {
    return {
      label: t("weatherAlertsTool.rainIntensityLarge", "大雨"),
      bg: "bg-amber-500 text-white",
      border: "border-amber-300 dark:border-amber-800",
    };
  }
  if (mm1 >= 10 || mm24 >= 20) {
    return {
      label: t("weatherAlertsTool.rainIntensityModerate", "中雨"),
      bg: "bg-sky-500 text-white",
      border: "border-sky-300 dark:border-sky-800",
    };
  }
  if (mm1 > 0 || mm24 > 0) {
    return {
      label: t("weatherAlertsTool.rainIntensityLight", "小雨"),
      bg: "bg-emerald-500 text-white",
      border: "border-emerald-300 dark:border-emerald-800",
    };
  }
  return {
    label: t("weatherAlertsTool.rainIntensityNone", "無明顯降雨"),
    bg: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-700",
  };
};

export default function WeatherRainfallLocator({
  initialTopStations = [],
}: {
  initialTopStations?: TopRainfallStation[];
}) {
  const { t } = useLanguage();
  const geolocation = useSharedGeolocation();
  const [locating, setLocating] = useState(false);
  const [selectedCounty, setSelectedCounty] = useState("");
  const [locationName, setLocationName] = useState<string | null>(null);
  const [rainfallData, setRainfallData] = useState<NearestRainfallOverview | null>(null);
  const [topStations, setTopStations] = useState<TopRainfallStation[]>(initialTopStations);
  const [resolvedCounty, setResolvedCounty] = useState<string | null>(null);
  const [countyAlerts, setCountyAlerts] = useState<CwaAlertItem[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 使用者按下「GPS 重新定位」後才需要等待下面的 effect 處理 useSharedGeolocation 的結果。
  const [manualGpsRequested, setManualGpsRequested] = useState(false);
  // 初次載入的背景自動定位只套用一次，避免之後每次 geolocation.coords 變動（例如使用者按重新定位）都搶走手動選擇的縣市。
  const autoGpsAppliedRef = useRef(false);

  const fetchRainfall = useCallback(async (params: { lat?: number; lng?: number; county?: string }) => {
    setLocating(true);
    setErrorMsg(null);
    try {
      const query = new URLSearchParams();
      if (params.lat != null && params.lng != null) {
        query.set("lat", String(params.lat));
        query.set("lng", String(params.lng));
      }
      if (params.county) {
        query.set("county", params.county);
      }

      const res = await fetchWithTimeout(`/api/weather/rainfall?${query.toString()}`, { timeoutMs: 5000 });
      const json = await res.json();

      if (json.success && json.data) {
        setRainfallData(json.data.nearest);
        if (json.data.topStations) {
          setTopStations(json.data.topStations);
        }
        setResolvedCounty(json.data.county ?? null);
        setCountyAlerts(json.data.countyAlerts ?? null);
      } else {
        setErrorMsg(t("weatherAlertsTool.errorFetchFailed", "無法取得該區域雨量資訊，請稍後再試。"));
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(t("weatherAlertsTool.errorNetworkFailed", "連線失敗，請檢查網路狀態。"));
    } finally {
      setLocating(false);
    }
  }, [t]);

  const handleGeoLocate = () => {
    if (geolocation.status === "unsupported") {
      setErrorMsg(t("weatherAlertsTool.errorUnsupportedGps", "您的瀏覽器不支援 GPS 地理定位。"));
      return;
    }
    setLocating(true);
    setErrorMsg(null);
    setManualGpsRequested(true);
    // 唯一允許跳出瀏覽器原生授權彈窗、略過快取重新嘗試一次的路徑；結果由下面的 effect 接手套用。
    geolocation.refresh();
  };

  // 使用者按下「GPS 重新定位」後，等 useSharedGeolocation 解析出終態（成功／
  // 拒絕／逾時／不支援）再套用結果或顯示對應的錯誤訊息——取代舊版用
  // getCurrentPosition 的 error callback 直接判斷 PERMISSION_DENIED 的寫法。
  useEffect(() => {
    if (!manualGpsRequested) return;
    if (geolocation.status === "locating" || geolocation.status === "awaiting-permission") return;
    // Deferred via queueMicrotask (see lib/hooks/useSharedGeolocation.ts's
    // own mount effect / docs/archive/specs/set-state-in-effect-fix.md,
    // issue #121/#122): avoids react-hooks/set-state-in-effect from calling
    // setState directly in the effect body.
    queueMicrotask(() => {
      setManualGpsRequested(false);
      if (geolocation.coords) {
        // Sentinel, not displayed directly — the UI label is resolved from
        // CURRENT_LOCATION_SENTINEL via t() at render time, below, so a
        // later language switch doesn't leave stale baked-in Chinese text
        // sitting in this state.
        setLocationName(CURRENT_LOCATION_SENTINEL);
        setSelectedCounty("");
        fetchRainfall({ lat: geolocation.coords.lat, lng: geolocation.coords.lng });
      } else {
        setLocating(false);
        if (geolocation.status === "denied") {
          setErrorMsg(t("weatherAlertsTool.errorPermissionDenied", "未取得定位權限，您可直接選擇縣市查詢。"));
        } else {
          setErrorMsg(t("weatherAlertsTool.errorLocationFailed", "定位失敗，請手動選擇縣市。"));
        }
      }
    });
  }, [manualGpsRequested, geolocation.status, geolocation.coords, fetchRainfall, t]);

  const handleCountyChange = (county: string) => {
    setSelectedCounty(county);
    setLocationName(county);
    if (county) {
      fetchRainfall({ county });
    }
  };

  // 雙軌即時渲染：初次載入立即抓臺北雨量顯示，不等待 GPS。
  useEffect(() => {
    queueMicrotask(() => {
      setSelectedCounty("臺北市");
      setLocationName("臺北市");
      fetchRainfall({ county: "臺北市" });
    });
  }, [fetchRainfall]);

  // 背景的 useSharedGeolocation 自動定位一旦解析出座標（不需要使用者按按
  // 鈕），就平滑切換成 GPS 結果——延續上面「雙軌即時渲染」的既有行為，只套
  // 用一次，不會在使用者之後手動選擇縣市時又被搶走。拒絕/逾時/不支援時維持
  // 顯示臺北市雨量，使用者可直接用下方的縣市下拉選單手動查詢（本頁原本就
  // 有，不需要再加一個手動選擇用的提示元件）。
  useEffect(() => {
    if (autoGpsAppliedRef.current) return;
    if (!geolocation.coords) return;
    autoGpsAppliedRef.current = true;
    const { lat, lng } = geolocation.coords;
    queueMicrotask(() => {
      setLocationName(CURRENT_LOCATION_SENTINEL);
      setSelectedCounty("");
      fetchRainfall({ lat, lng });
    });
  }, [geolocation.coords, fetchRainfall]);

  const realtime = rainfallData?.realtime;
  const accumulation = rainfallData?.accumulation;
  const mm24 = parseFloat(realtime?.precip_24hr || "0") || 0;
  const mm1 = parseFloat(realtime?.precip_1hr || "0") || 0;
  const badge = getRainIntensityBadge(t, mm24, mm1);
  const referenceLabel =
    locationName === CURRENT_LOCATION_SENTINEL
      ? t("weatherAlertsTool.currentLocationLabel", "您的目前位置")
      : locationName;

  return (
    <div className="space-y-6">
      {/* Controls: GPS button + County selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {t("weatherAlertsTool.locatorHeading", "🌧️ 即時雨量觀測站定位")}
          </h3>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            {t(
              "weatherAlertsTool.locatorSubheading",
              "自動連線中央氣象署 1,300+ 座自動雨量站 (O-A0002-001) 與 38 署屬氣象站歷史統計 (C-B0025-001)",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGeoLocate}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 shadow-xs transition-colors hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/80"
          >
            <span className={locating ? "animate-spin" : ""}>📍</span>
            <span>
              {locating
                ? t("weatherAlertsTool.locatingButton", "定位查詢中...")
                : t("weatherAlertsTool.gpsRelocateButton", "GPS 重新定位")}
            </span>
          </button>

          <select
            value={selectedCounty}
            onChange={(e) => handleCountyChange(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            aria-label={t("weatherAlertsTool.countySelectAriaLabel", "選擇縣市")}
          >
            <option value="">{t("weatherAlertsTool.countySelectDefaultOption", "-- 手動切換縣市 --")}</option>
            {TAIWAN_COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* County-level alerts for the resolved location — a direct answer ("your county has N
          active alerts") instead of making the visitor scan the full nationwide list below for
          their own area. Pure filter of the same data that list renders, so it can never disagree
          with it. Only shown once a location has actually resolved (county !== null). */}
      {resolvedCounty && countyAlerts && (
        <div
          className={`rounded-xl border p-3.5 ${
            countyAlerts.length > 0
              ? "border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20"
              : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20"
          }`}
        >
          <p
            className={`text-sm font-bold ${
              countyAlerts.length > 0
                ? "text-red-900 dark:text-red-200"
                : "text-emerald-900 dark:text-emerald-200"
            }`}
          >
            {countyAlerts.length > 0
              ? t(
                  "weatherAlertsTool.countyAlertsActiveTemplate",
                  "📍 {county} 目前有 {count} 則生效中特報",
                )
                  .replace("{county}", resolvedCounty)
                  .replace("{count}", String(countyAlerts.length))
              : t("weatherAlertsTool.countyAlertsNoneTemplate", "📍 {county} 目前無生效中特報").replace(
                  "{county}",
                  resolvedCounty,
                )}
          </p>
          {countyAlerts.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {countyAlerts.map((alert) => (
                <li
                  key={alert.id}
                  className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/60 dark:text-red-200"
                >
                  {alert.event}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Main Grid: Nearest Station Card & Top 5 Leaderboard */}
      <div className="grid gap-5 md:grid-cols-3">
        {/* Left: Nearest Station (2 columns) */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-xs md:col-span-2 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {realtime?.station_name || t("weatherAlertsTool.stationConnecting", "測站連線中...")}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {realtime?.station_id || "--"}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.bg}`}>
                  {badge.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                {t("weatherAlertsTool.locatedAtPrefix", "📍 位於 ")}
                {realtime?.county_name || ""}{realtime?.town_name || ""}
                {realtime?.distance_km != null && (
                  <span className="ml-1 font-semibold text-indigo-600 dark:text-indigo-400">
                    {t("weatherAlertsTool.distanceKmParenTemplate", "（距離約 {value} km）").replace(
                      "{value}",
                      realtime.distance_km.toFixed(1),
                    )}
                  </span>
                )}
                {referenceLabel &&
                  `${t("weatherAlertsTool.referenceBasisPrefix", " · 參考基準：")}${referenceLabel}`}
              </p>
            </div>
            {realtime?.obs_time && (
              <span className="text-[11px] text-slate-600">
                {t("weatherAlertsTool.obsTimeLabel", "觀測時間：")}
                {new Date(realtime.obs_time).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          {/* Realtime Accumulation stats (O-A0002-001) */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800/80 dark:bg-slate-850">
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("weatherAlertsTool.hourlyRainLabel", "時雨量 (1小時)")}</p>
              <p className="mt-1 font-mono text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {formatRainValue(realtime?.precip_1hr)} <span className="text-xs font-normal text-slate-600">mm</span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800/80 dark:bg-slate-850">
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("weatherAlertsTool.rain3hrLabel", "3小時累積")}</p>
              <p className="mt-1 font-mono text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {formatRainValue(realtime?.precip_3hr)} <span className="text-xs font-normal text-slate-600">mm</span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800/80 dark:bg-slate-850">
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("weatherAlertsTool.rain24hrLabel", "24小時累積 (日雨量)")}</p>
              <p className="mt-1 font-mono text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
                {formatRainValue(realtime?.precip_24hr)} <span className="text-xs font-normal text-slate-600">mm</span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800/80 dark:bg-slate-850">
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("weatherAlertsTool.rain3daysLabel", "3天累積雨量")}</p>
              <p className="mt-1 font-mono text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {formatRainValue(realtime?.precip_3days)} <span className="text-xs font-normal text-slate-600">mm</span>
              </p>
            </div>
          </div>

          {/* Historical Accumulation stats (C-B0025-001) */}
          <div className="mt-4 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>
                {t("weatherAlertsTool.historicalAccumulationLabel", "📊 氣象站中長期累積歷史 (C-B0025-001)：")}
                {accumulation?.station_name || t("weatherAlertsTool.defaultStationFallback", "署屬測站")}
              </span>
              {accumulation?.distance_km != null && (
                <span className="text-[11px] text-slate-600">
                  {t("weatherAlertsTool.distanceKmTemplate", "距約 {value} km").replace(
                    "{value}",
                    accumulation.distance_km.toFixed(1),
                  )}
                </span>
              )}
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-white p-2 shadow-2xs dark:bg-slate-800">
                <span className="text-slate-600 dark:text-slate-400">{t("weatherAlertsTool.monthlyAccumulationLabel", "本月累積雨量")}</span>
                <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                  {accumulation?.month_mm != null ? accumulation.month_mm.toFixed(1) : "--"} mm
                </p>
              </div>
              <div className="rounded-lg bg-white p-2 shadow-2xs dark:bg-slate-800">
                <span className="text-slate-600 dark:text-slate-400">{t("weatherAlertsTool.yearlyAccumulationLabel", "本年度累積雨量")}</span>
                <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                  {accumulation?.year_mm != null ? accumulation.year_mm.toFixed(1) : "--"} mm
                </p>
              </div>
              <div className="rounded-lg bg-white p-2 shadow-2xs dark:bg-slate-800">
                <span className="text-slate-600 dark:text-slate-400">{t("weatherAlertsTool.wetDays30Label", "近30天降雨日")}</span>
                <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                  {accumulation?.wet_days_30 != null
                    ? t("weatherAlertsTool.daysUnitTemplate", "{value} 天").replace(
                        "{value}",
                        String(accumulation.wet_days_30),
                      )
                    : "--"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Top 5 24hr Rainfall Leaderboard */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <h4 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {t("weatherAlertsTool.leaderboardHeading", "🏆 全台 24H 雨量排行")}
            </h4>
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              {t("weatherAlertsTool.hotspotBadge", "降雨熱區")}
            </span>
          </div>

          <div className="mt-3 space-y-2.5">
            {topStations.length > 0 ? (
              topStations.slice(0, 5).map((st, idx) => {
                const rain24 = parseFloat(st.precip_24hr || "0") || 0;
                return (
                  <div
                    key={st.station_id}
                    className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-slate-800/60"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          idx === 0
                            ? "bg-amber-500 text-white"
                            : idx === 1
                              ? "bg-slate-400 text-white"
                              : idx === 2
                                ? "bg-amber-700 text-white"
                                : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          {st.station_name}
                        </p>
                        <p className="text-[10px] text-slate-600">
                          {st.county_name} {st.town_name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                        {rain24.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-slate-600"> mm</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-4 text-center text-xs text-slate-600">
                {t("weatherAlertsTool.leaderboardEmpty", "目前全台各地降雨均未達顯著累積量。")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
