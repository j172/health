"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSharedGeolocation } from "@/lib/hooks/useSharedGeolocation";
import { useSidebarWidgetData } from "@/components/Tools/useSidebarWidgetData";
import { TAIWAN_COUNTY_CENTROIDS } from "@/lib/constants/taiwanDistricts";
import CountyDistrictPicker from "@/components/Facilities/CountyDistrictPicker";
import type { HomeStatusResponse, HomeStatusSection } from "@/app/api/home-status/route";
import { useLanguage } from "@/app/context/LanguageContext";

/**
 * Homepage top status bar (issue #472, parent #438 §G acceptance criterion
 * 1: "首頁最上方 3 秒內能看到天氣、AQI、UV、最新地震、警報的精簡狀態").
 *
 * Geolocation: `useSharedGeolocation` (issue #477), never the older
 * `components/Facilities/useGeolocation.ts` — see
 * components/Nearby/NearbyContent.tsx for the established reference
 * implementation of this choice, including its manual county-picker
 * fallback for denied/timeout/unsupported, which this component mirrors.
 *
 * Single-aggregation-API requirement: this is the ONE client component that
 * calls `/api/home-status`, replacing the 3 of the old homepage sidebar's
 * independent per-widget client fetches that duplicated this same data —
 * LocalWeatherSvgWidget, AqiSidebarWidget, and UvSidebarWidget each
 * previously called their own endpoint (see lib/server/home/queries.ts's
 * doc comment for which ones) — plus WeatherAlertSidebarWidget/
 * EarthquakeSidebarWidget, which were already server-prop-driven with no
 * client fetch of their own. See
 * components/News/NewsSidebar.tsx's `hideStatusBarDuplicateWidgets` prop,
 * which hides only those 5 widgets on the home variant — per a 2026-10-13
 * product decision on issue #472, the other 5 sidebar widgets (ER status /
 * CPC fuel price / water outages / CDC travel alerts / pest alerts, which
 * this status bar does NOT cover) keep rendering on home exactly as before,
 * with their own independent fetches untouched.
 * `useSidebarWidgetData`'s `buildUrl` deliberately returns `null` (skipping
 * the fetch) until geolocation reaches a terminal status
 * (success/denied/timeout/unsupported) so this fires exactly once per page
 * load in the common case, instead of firing once immediately without
 * coordinates and again once they resolve.
 *
 * Per-section failure isolation: the API's response already carries one
 * status per section (`"ok" | "error" | "unavailable"`, see
 * lib/server/home/aggregate.ts), so this component just renders each
 * section independently off that — one section's data source failing never
 * affects how the other 4 render (acceptance criterion: "其中任一區塊資料來
 * 源暫時失敗，只有那一區顯示錯誤狀態，其他區塊正常顯示").
 */

const GEOLOCATION_SETTLED_STATUSES = new Set(["success", "denied", "timeout", "unsupported"]);

function magnitudeColor(mag: number): string {
  if (mag >= 8.0) return "#7c3aed";
  if (mag >= 7.0) return "#dc2626";
  if (mag >= 6.0) return "#ea580c";
  return "#4f46e5";
}

function StatusPill({
  emoji,
  label,
  children,
  href,
}: {
  emoji: string;
  label: string;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-[9.5rem] flex-1 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs transition-colors hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
    >
      <span aria-hidden="true" className="text-xl leading-none">{emoji}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{children}</div>
      </div>
    </Link>
  );
}

function SkeletonPill({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="flex min-w-[9.5rem] flex-1 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <span aria-hidden="true" className="text-xl leading-none opacity-40">{emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <div className="mt-1 h-3 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

function ErrorPill({ emoji, label, href, message }: { emoji: string; label: string; href: string; message: string }) {
  return (
    <Link
      href={href}
      className="flex min-w-[9.5rem] flex-1 items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50/70 px-3.5 py-2.5 shadow-xs dark:border-red-900/60 dark:bg-red-950/30"
    >
      <span aria-hidden="true" className="text-xl leading-none">{emoji}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">{label}</p>
        <p className="truncate text-xs font-semibold text-red-700 dark:text-red-300">{message}</p>
      </div>
    </Link>
  );
}

export default function HomeStatusBar() {
  const { t } = useLanguage();
  const geolocation = useSharedGeolocation();
  const [manualCounty, setManualCounty] = useState("");
  const [manualDistrict, setManualDistrict] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const manualCoords = useMemo(() => {
    if (!manualCounty) return null;
    const centroid = TAIWAN_COUNTY_CENTROIDS[manualCounty];
    return centroid ? { lat: centroid.lat, lng: centroid.lng } : null;
  }, [manualCounty]);

  const effectiveCoords = geolocation.coords ?? manualCoords;
  const geolocationSettled = GEOLOCATION_SETTLED_STATUSES.has(geolocation.status);

  const { status: apiStatus, data, refresh } = useSidebarWidgetData<HomeStatusResponse>({
    buildUrl: () => {
      if (!geolocationSettled) return null;
      return effectiveCoords
        ? `/api/home-status?lat=${effectiveCoords.lat}&lng=${effectiveCoords.lng}`
        : "/api/home-status";
    },
    parse: (json) => json as HomeStatusResponse,
    deps: [geolocationSettled, effectiveCoords?.lat, effectiveCoords?.lng],
  });

  const sections = data?.sections;
  const showInitialSkeleton = apiStatus === "loading" && !data;
  const needsLocationHint = geolocation.needsManualSelection && !manualCoords;

  const handlePickCounty = (county: string) => {
    setManualCounty(county);
    setManualDistrict("");
  };

  function renderSection<T>(
    section: HomeStatusSection<T> | undefined,
    emoji: string,
    label: string,
    href: string,
    renderOk: (data: T) => React.ReactNode,
  ) {
    if (showInitialSkeleton || !section) {
      return <SkeletonPill key={label} emoji={emoji} label={label} />;
    }
    if (section.status === "error") {
      return (
        <ErrorPill key={label} emoji={emoji} label={label} href={href} message={t("homePage.statusBar.loadFailed", "載入失敗")} />
      );
    }
    if (section.status === "unavailable") {
      return (
        <button
          key={label}
          type="button"
          onClick={() => setShowPicker(true)}
          className="flex min-w-[9.5rem] flex-1 items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-left shadow-xs transition-colors hover:border-amber-300 dark:border-amber-900/60 dark:bg-amber-950/30"
        >
          <span aria-hidden="true" className="text-xl leading-none">{emoji}</span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">{label}</p>
            <p className="truncate text-xs font-semibold text-amber-800 dark:text-amber-300">
              {t("homePage.statusBar.needsLocation", "需要定位")}
            </p>
          </div>
        </button>
      );
    }
    return (
      <StatusPill key={label} emoji={emoji} label={label} href={href}>
        {renderOk(section.data)}
      </StatusPill>
    );
  }

  return (
    <section aria-label={t("homePage.statusBar.sectionAriaLabel", "即時狀態總覽")} className="mb-8">
      <div className="flex flex-wrap gap-3">
        {renderSection(sections?.weather, "🌤️", t("homePage.statusBar.weatherLabel", "天氣"), "/tools/weather-alerts", (weather) =>
          weather ? (
            <>
              {weather.airTemperature ? `${weather.airTemperature}°C` : t("homePage.statusBar.liveObservation", "即時觀測")} ·{" "}
              {weather.weather || t("homePage.statusBar.comfortableDefault", "舒適晴朗")}
            </>
          ) : (
            t("homePage.statusBar.noData", "暫無資料")
          ),
        )}

        {renderSection(sections?.aqi, "🍃", t("homePage.statusBar.aqiLabel", "AQI"), "/tools/aqi", (aqi) =>
          aqi ? (
            <>
              {aqi.aqiValue ?? "--"} · {aqi.aqiStatus}
            </>
          ) : (
            t("homePage.statusBar.noData", "暫無資料")
          ),
        )}

        {renderSection(sections?.uv, "☀️", t("homePage.statusBar.uvLabel", "紫外線"), "/tools/uv", (uv) =>
          uv ? (
            <>
              {uv.uvIndex} · {uv.uvLabel}
            </>
          ) : (
            t("homePage.statusBar.noData", "暫無資料")
          ),
        )}

        {renderSection(sections?.earthquake, "🌍", t("homePage.statusBar.earthquakeLabel", "最新地震"), "/tools/earthquakes", (quakes) =>
          quakes.length > 0 ? (
            <span style={{ color: magnitudeColor(quakes[0].magnitude) }}>
              M{quakes[0].magnitude.toFixed(1)} {quakes[0].place_zh ?? quakes[0].place ?? t("homePage.statusBar.unknownLocation", "未知地點")}
            </span>
          ) : (
            t("homePage.statusBar.stableRecently", "近期平穩")
          ),
        )}

        {renderSection(sections?.alerts, "⚠️", t("homePage.statusBar.alertsLabel", "警報"), "/tools/weather-alerts", (alerts) =>
          alerts.length > 0
            ? t("homePage.statusBar.alertsCountTemplate", "{count} 則有效警報").replace("{count}", String(alerts.length))
            : t("homePage.statusBar.noAlerts", "無特報"),
        )}
      </div>

      {needsLocationHint && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs dark:border-amber-900/60 dark:bg-amber-950/30">
          <p className="font-semibold text-amber-800 dark:text-amber-300">
            {geolocation.status === "denied" && t("homePage.statusBar.deniedPrefix", "您已拒絕定位授權，")}
            {geolocation.status === "timeout" && t("homePage.statusBar.timeoutPrefix", "定位逾時，")}
            {geolocation.status === "unsupported" && t("homePage.statusBar.unsupportedPrefix", "瀏覽器不支援定位，")}
            {t("homePage.statusBar.chooseCountyMessage", "請改選您所在的縣市以顯示在地天氣、AQI 與 UV 指數。")}
          </p>
          {!showPicker ? (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="mt-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
            >
              {t("homePage.statusBar.chooseCountyButton", "選擇縣市")}
            </button>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CountyDistrictPicker
                county={manualCounty}
                district={manualDistrict}
                onCountyChange={handlePickCounty}
                onDistrictChange={setManualDistrict}
              />
              <button
                type="button"
                onClick={geolocation.refresh}
                className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
              >
                {t("homePage.statusBar.retryLocationButton", "🔄 重新嘗試定位")}
              </button>
            </div>
          )}
        </div>
      )}

      {apiStatus === "error" && data && (
        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
          {t("homePage.statusBar.refreshFailedNotice", "重新整理失敗，顯示的可能是過期資料。")}
          <button type="button" onClick={refresh} className="ml-1 underline">
            {t("homePage.statusBar.retryButton", "重試")}
          </button>
        </p>
      )}
    </section>
  );
}
