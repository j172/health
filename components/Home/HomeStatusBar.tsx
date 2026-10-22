"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSharedGeolocation } from "@/lib/hooks/useSharedGeolocation";
import { useSidebarWidgetData } from "@/components/Tools/useSidebarWidgetData";
import { TAIWAN_COUNTY_CENTROIDS } from "@/lib/constants/taiwanDistricts";
import CountyDistrictPicker from "@/components/Facilities/CountyDistrictPicker";
import type { HomeStatusResponse, HomeStatusSection } from "@/app/api/home-status/route";
import type { HomeStatusWorkday } from "@/lib/server/officeCalendar/homeWorkday";
import type { CwaAlertItem } from "@/lib/server/cwa/queries";
import { useLanguage } from "@/app/context/LanguageContext";
import { buildHomeWorkdayChip, type HomeWorkdayChip } from "@/lib/tools/workSchoolStatus/calendar";
import { useMinuteClock } from "@/lib/hooks/useMinuteClock";

/** Same shape as useLanguage()'s `t`, matching this repo's convention (e.g. components/Tools/WorkSchoolStatusContent.tsx) for typing a passed-down translator. */
type Translate = (key: string, defaultValue?: string) => string;

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
 * product decision on issue #472, the other sidebar widgets (ER status /
 * CPC fuel price / water outages / CDC travel alerts, which
 * this status bar does NOT cover) keep rendering on home exactly as before,
 * with their own independent fetches untouched. (Pest alerts was a 5th such
 * widget but was retired outright by issue #788.)
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

/**
 * One emoji per CWA alert type, for the 警報 block's per-alert list
 * (home-alerts-severity-and-workday-tomorrow follow-up to #777).
 *
 * Rules are tried top to bottom and the first match wins. The typhoon/
 * tsunami dataset checks come first because a typhoon's own `event` text
 * (e.g. "強烈颱風 薔琵 (CHAMPI) 第29號") also contains "風", which would
 * otherwise satisfy the generic 陸上強風特報 keyword rule meant for ordinary
 * W-C0033-* bulletins. The #774 township-level hazard rows (W-C0033-001)
 * have no dataset-specific rule here: listActiveCwaAlerts (lib/server/cwa/
 * queries.ts) aliases their `phenomena` text (大雨/強風/濃霧/...) into the
 * same `event` column every other alert uses, so they fall through to the
 * matching keyword rule below like any other bulletin would.
 */
const GENERIC_ALERT_EMOJI = "📢";

const ALERT_EMOJI_RULES: ReadonlyArray<{ matches: (alert: CwaAlertItem) => boolean; emoji: string }> = [
  // 颱風警報 (W-C0034-001) / 颱風路徑與消息 (W-C0034-005)
  {
    matches: (alert) =>
      alert.dataset_id === "W-C0034-001" ||
      alert.dataset_id === "W-C0034-005" ||
      Boolean(alert.event?.includes("颱風")) ||
      Boolean(alert.event?.includes("熱帶性低氣壓")),
    emoji: "🌀",
  },
  // 海嘯 (E-A0014-001)
  {
    matches: (alert) => alert.dataset_id === "E-A0014-001" || Boolean(alert.event?.includes("海嘯")),
    emoji: "⚠️",
  },
  // 豪大雨特報 (W-C0033-005)，以及任何含「雨」字的鄉鎮天氣現象特報
  { matches: (alert) => Boolean(alert.event?.includes("雨")), emoji: "🌊" },
  // 陸上強風特報 (W-C0033-003)，以及任何含「風」字的鄉鎮天氣現象特報
  { matches: (alert) => Boolean(alert.event?.includes("風")), emoji: "💨" },
  // 濃霧特報 (W-C0033-004)，以及任何含「霧」字的鄉鎮天氣現象特報
  { matches: (alert) => Boolean(alert.event?.includes("霧")), emoji: "🌫️" },
];

/** Picks one alert's emoji; a type this table doesn't recognise still gets the generic fallback, never none. */
function getAlertEmoji(alert: CwaAlertItem): string {
  return ALERT_EMOJI_RULES.find((rule) => rule.matches(alert))?.emoji ?? GENERIC_ALERT_EMOJI;
}

/**
 * CAP severity (`CwaAlertItem.severity`, one of Extreme/Severe/Moderate/
 * Minor) → the same Chinese labels already shown on /tools/weather-alerts
 * (WeatherAlertsList's severity badge), reused here (and already translated
 * into en/ja/ko) so the two surfaces never disagree about what "Severe"
 * means. Returns null for a missing/unrecognised severity so the caller can
 * omit the "(...)" suffix entirely instead of showing "(null)".
 */
function getAlertSeverityLabel(t: Translate, severity: string | null): string | null {
  switch (severity) {
    case "Extreme":
      return t("weatherAlertsTool.severityExtreme", "極端危險");
    case "Severe":
      return t("weatherAlertsTool.severitySevere", "嚴重警戒");
    case "Moderate":
      return t("weatherAlertsTool.severityModerate", "中度注意");
    case "Minor":
      return t("weatherAlertsTool.severityMinor", "輕微提示");
    default:
      return null;
  }
}

// "alert" is the highlighted look used by the 警報 block below whenever at
// least one CWA alert is active (hasAlerts) — the 今天上班上課/明日上班 pills no
// longer use it (see the home-alerts-severity-and-workday-tomorrow follow-up
// to issue #691: they stopped special-casing a typhoon warning).
type PillTone = "default" | "alert";

const PILL_TONE_CLASSES: Record<PillTone, { box: string; label: string; value: string }> = {
  default: {
    box: "border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700",
    label: "text-slate-500 dark:text-slate-400",
    value: "text-slate-800 dark:text-slate-100",
  },
  alert: {
    box: "border-red-300 bg-red-50 hover:border-red-400 dark:border-red-900/70 dark:bg-red-950/40 dark:hover:border-red-700",
    label: "text-red-700 dark:text-red-300",
    value: "text-red-800 dark:text-red-200",
  },
};

function StatusPill({
  emoji,
  label,
  children,
  href,
  tone = "default",
}: {
  emoji: string;
  label: string;
  children: React.ReactNode;
  href: string;
  tone?: PillTone;
}) {
  const classes = PILL_TONE_CLASSES[tone];
  return (
    <Link
      href={href}
      className={`flex min-w-[9.5rem] flex-1 items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-xs transition-colors ${classes.box}`}
    >
      <span aria-hidden="true" className="text-xl leading-none">{emoji}</span>
      <div className="min-w-0">
        <p className={`text-[10px] font-semibold uppercase tracking-wide ${classes.label}`}>{label}</p>
        <div className={`truncate text-xs font-bold ${classes.value}`}>{children}</div>
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

// Issue #778 (母票沿用 #744 的拆除)：首頁常駐的「明天放假嗎？」大卡片
// （舊 HomeQuickEntryCards）移除後，這個問題的入口改成附屬在「今日上班」
// 薥目旁邊的一個小圖示連結——明顯比薥目本身小，不是另一個同等大小的薥目。
// 點了一樣導向 /tools/work-school-status（該頁「明天」欄位；目前沒有專屬
// 錨點，所以連去整頁）。
function WorkdayTomorrowShortcut({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 flex-none items-center justify-center self-stretch rounded-xl border border-slate-200 bg-white text-base text-slate-500 shadow-xs transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-indigo-700 dark:hover:text-indigo-400"
    >
      <span aria-hidden="true">🗓️</span>
    </Link>
  );
}

export default function HomeStatusBar() {
  const { t } = useLanguage();
  const geolocation = useSharedGeolocation();
  const [manualCounty, setManualCounty] = useState("");
  const [manualDistrict, setManualDistrict] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  // Issue #691: the 今天上班上課/明日上班 pills resolve their day with the
  // visitor's own clock (Asia/Taipei date, see
  // lib/tools/workSchoolStatus/calendar.ts) from the rows /api/home-status
  // returns, because that response is edge-cached for minutes and a cached
  // answer served after midnight would be yesterday's. The clock comes from
  // useMinuteClock (null until mounted, refreshed each minute) so it is
  // never read during render.
  const nowMs = useMinuteClock();

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
    getTone?: (data: T) => PillTone,
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
      <StatusPill key={label} emoji={emoji} label={label} href={href} tone={getTone?.(section.data) ?? "default"}>
        {renderOk(section.data)}
      </StatusPill>
    );
  }

  // Issue #691, follow-up home-alerts-severity-and-workday-tomorrow:
  // 今天上班上課 / 明日上班. Both pills only ever reflect the office calendar rows
  // (lib/server/officeCalendar) — no typhoon special-casing any more. A CWA
  // typhoon warning is surfaced elsewhere (the site-wide TyphoonBanner, issue
  // #744) and via /tools/work-school-status's own ClosureGuidanceSection,
  // untouched by this component. "Tomorrow" needs no new data: the API
  // already returns yesterday-through-+2-days of rows (see
  // fetchHomeStatusWorkday's doc comment), so resolving it is just +24h on
  // the same clock reading — Taiwan has had no DST since 1979, so a flat
  // 24h offset always lands on the next Asia/Taipei calendar date.
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const todayWorkdayChip = (workday: HomeStatusWorkday) => (nowMs === null ? null : buildHomeWorkdayChip(workday.days, nowMs));
  const tomorrowWorkdayChip = (workday: HomeStatusWorkday) =>
    nowMs === null ? null : buildHomeWorkdayChip(workday.days, nowMs + ONE_DAY_MS);

  const describeWorkdayState = (chip: HomeWorkdayChip | null): React.ReactNode => {
    if (!chip) return null;
    switch (chip.state) {
      case "workday":
        return t("homePage.statusBar.workdayWorkday", "正常上班上課");
      case "makeup-workday":
        return t("homePage.statusBar.workdayMakeup", "補班日（要上班）");
      case "off":
        if (chip.offReason === "weekend") return t("homePage.statusBar.workdayOffWeekend", "放假（週末）");
        return chip.name
          ? t("homePage.statusBar.workdayOffNamedTemplate", "放假・{name}").replace("{name}", chip.name)
          : t("homePage.statusBar.workdayOff", "放假");
      default:
        return t("homePage.statusBar.workdayUnknown", "查無日曆資料");
    }
  };

  // 警報 is pulled out of the 5-pill horizontal row into its own full-width
  // block below: unlike the other sections it needs to list every active
  // alert's name, not a single truncated line, so it can't share
  // StatusPill's fixed-width layout. The tone convention (default/alert) and
  // skeleton/error/unavailable handling still mirror `renderSection` above.
  const alertsEmoji = "⚠️";
  const alertsLabel = t("homePage.statusBar.alertsLabel", "警報");
  const alertsHref = "/tools/weather-alerts";

  function renderAlertsSection() {
    const section = sections?.alerts;

    if (showInitialSkeleton || !section) {
      return (
        <div className="flex w-full items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <span aria-hidden="true" className="text-xl leading-none opacity-40">{alertsEmoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{alertsLabel}</p>
            <div className="mt-1 h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      );
    }

    if (section.status === "error") {
      return (
        <Link
          href={alertsHref}
          className="flex w-full items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50/70 px-3.5 py-2.5 shadow-xs dark:border-red-900/60 dark:bg-red-950/30"
        >
          <span aria-hidden="true" className="text-xl leading-none">{alertsEmoji}</span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">{alertsLabel}</p>
            <p className="truncate text-xs font-semibold text-red-700 dark:text-red-300">
              {t("homePage.statusBar.loadFailed", "載入失敗")}
            </p>
          </div>
        </Link>
      );
    }

    if (section.status === "unavailable") {
      // Alerts are nationwide (see fetchHomeStatusAlerts) so this branch is
      // not expected in practice, but HomeStatusSection's "unavailable"
      // status is still a valid type-level case to handle.
      return (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="flex w-full items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-left shadow-xs transition-colors hover:border-amber-300 dark:border-amber-900/60 dark:bg-amber-950/30"
        >
          <span aria-hidden="true" className="text-xl leading-none">{alertsEmoji}</span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">{alertsLabel}</p>
            <p className="truncate text-xs font-semibold text-amber-800 dark:text-amber-300">
              {t("homePage.statusBar.needsLocation", "需要定位")}
            </p>
          </div>
        </button>
      );
    }

    const alerts: CwaAlertItem[] = section.data;
    const hasAlerts = alerts.length > 0;
    const tone: PillTone = hasAlerts ? "alert" : "default";
    const classes = PILL_TONE_CLASSES[tone];

    return (
      <Link
        href={alertsHref}
        className={`flex w-full items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-xs transition-colors ${classes.box}`}
      >
        <span aria-hidden="true" className="mt-0.5 text-xl leading-none">{alertsEmoji}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${classes.label}`}>{alertsLabel}</p>
          {hasAlerts ? (
            <ul className={`mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-bold ${classes.value}`}>
              {alerts.map((alert) => {
                const name = alert.event || alert.headline || t("homePage.statusBar.alertsGenericName", "氣象警報");
                const severityLabel = getAlertSeverityLabel(t, alert.severity);
                return (
                  <li key={`${alert.dataset_id}-${alert.id}`}>
                    <span aria-hidden="true">{getAlertEmoji(alert)}</span>
                    {name}
                    {severityLabel ? ` (${severityLabel})` : ""}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={`text-xs font-bold ${classes.value}`}>{t("homePage.statusBar.noAlerts", "無特報")}</p>
          )}
        </div>
      </Link>
    );
  }

  return (
    <section aria-label={t("homePage.statusBar.sectionAriaLabel", "即時狀態總覽")} className="mb-8">
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[9.5rem] flex-1 items-stretch gap-1.5">
          {renderSection(
            nowMs === null ? undefined : sections?.workday,
            "🏢",
            t("homePage.statusBar.workdayLabel", "今天上班上課"),
            "/tools/work-school-status",
            (workday) => describeWorkdayState(todayWorkdayChip(workday)),
          )}
          <WorkdayTomorrowShortcut
            href="/tools/work-school-status"
            label={t("homePage.statusBar.tomorrowShortcutLabel", "明天放假嗎？")}
          />
        </div>

        {renderSection(
          nowMs === null ? undefined : sections?.workday,
          "📅",
          t("homePage.statusBar.tomorrowWorkdayLabel", "明日上班"),
          "/tools/work-school-status",
          (workday) => describeWorkdayState(tomorrowWorkdayChip(workday)),
        )}

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

        {renderSection(sections?.earthquake, "🌍", t("homePage.statusBar.earthquakeLabel", "最新地震"), "/tools/global-watch/earthquakes", (quakes) =>
          quakes.length > 0 ? (
            <span style={{ color: magnitudeColor(quakes[0].magnitude) }}>
              M{quakes[0].magnitude.toFixed(1)} {quakes[0].place_zh ?? quakes[0].place ?? t("homePage.statusBar.unknownLocation", "未知地點")}
            </span>
          ) : (
            t("homePage.statusBar.stableRecently", "近期平穩")
          ),
        )}
      </div>

      <div className="mt-3">{renderAlertsSection()}</div>

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
